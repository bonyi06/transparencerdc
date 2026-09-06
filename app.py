"""
TransparenceRDC — back-end Flask.

Architecture :
  - Front-end : templates/index.html (squelette) + static/app.js (logique
    de rendu, graphiques, carte, explorateur — conservée du produit original)
    + static/style.css. Le JS ne contient plus aucune donnée : il va la
    chercher via les routes /api/* ci-dessous.
  - Back-end  : cette application Flask expose l'entrepôt de données ITIE-RDC
    (jeux de données, contenus éditoriaux, GeoJSON) stocké en base (SQLite
    par défaut, voir config.py) et gère un espace d'administration protégé
    par mot de passe (haché, côté serveur — contrairement à l'ancienne
    version qui comparait un hash SHA-256 côté client, ce qui n'est pas
    sûr) permettant de modifier les textes du site et de les publier.

Lancer en développement :
    flask --app app run --debug

Lancer en production (voir README) :
    gunicorn -w 4 -b 0.0.0.0:8000 wsgi:app
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from functools import wraps

import click
from flask import Flask, abort, jsonify, render_template, request, session
from flask_compress import Compress

from config import Config
from models import (
    AdminUser,
    AuditLog,
    ContentRevision,
    Dataset,
    GeoLayer,
    SiteContent,
    WarehouseMeta,
    db,
    run_light_migrations,
)

compress = Compress()


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    # Identifiant de version des fichiers statiques (app.js/style.css),
    # utilisé comme paramètre "?v=" dans templates/index.html. Comme ces
    # fichiers n'ont pas de nom versionné, les servir avec un long cache
    # navigateur (SEND_FILE_MAX_AGE_DEFAULT) sans ce paramètre ferait
    # tourner certains visiteurs sur une version JS obsolète pendant toute
    # la durée du cache après chaque déploiement (vécu en sept. 2026 : le
    # correctif de sécurité admin restait invisible pour des navigateurs
    # ayant mis en cache l'ancien app.js). Ce timestamp change à chaque
    # redémarrage du processus (donc à chaque déploiement Render), ce qui
    # force le navigateur à retélécharger les fichiers dès qu'ils changent,
    # tout en gardant le bénéfice du cache long entre deux déploiements.
    app.config["ASSET_VERSION"] = str(int(time.time()))

    db.init_app(app)
    compress.init_app(app)

    register_routes(app)
    register_cli(app)
    # Filet de sécurité : ajoute automatiquement les tables/colonnes que le
    # code attend mais qui manquent encore sur une base existante (voir
    # models.run_light_migrations — évite de revivre l'incident de
    # sept. 2026 où l'ajout des rôles/comptes multiples avait fait planter
    # la production faute de migration). Idempotent, sans danger à chaque
    # démarrage.
    try:
        run_light_migrations(app)
    except Exception:  # pragma: no cover - ne doit jamais empêcher le démarrage
        app.logger.exception("Échec de la migration légère au démarrage.")
    return app


# --------------------------------------------------------------------------- #
# Auth admin (session serveur — pas de mot de passe en clair côté client)
# --------------------------------------------------------------------------- #

def _deep_merge(base: dict, patch: dict) -> dict:
    """Fusionne récursivement `patch` dans `base` (sans mutation de `base`)."""
    out = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_id"):
            abort(401)
        return view(*args, **kwargs)

    return wrapped


def current_admin() -> "AdminUser | None":
    uid = session.get("admin_id")
    if not uid:
        return None
    return AdminUser.query.get(uid)


def admin_role_required(view):
    """Réservé aux comptes de rôle 'admin' (gestion des comptes, journal
    d'audit complet). Un compte 'editor' reçoit un 403 (authentifié mais
    pas autorisé), à distinguer du 401 (pas authentifié du tout)."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_admin()
        if user is None:
            abort(401)
        if user.role != "admin":
            abort(403)
        return view(*args, **kwargs)

    return wrapped


def log_audit(action: str, target: str = "", detail: str = "") -> None:
    """Consigne une action dans le journal d'audit. Best-effort : une
    erreur d'écriture du journal ne doit jamais faire échouer l'action
    métier elle-même (cohérent avec le reste de l'appli : la fiabilité de
    l'audit ne doit pas être un point de défaillance)."""
    try:
        user = current_admin()
        username = user.username if user else (session.get("audit_username") or "?")
        db.session.add(
            AuditLog(
                username=username,
                action=action,
                target=str(target)[:255],
                detail=str(detail)[:2000],
                ip=(request.headers.get("X-Forwarded-For", request.remote_addr) or "")[:64],
            )
        )
        db.session.commit()
    except Exception:  # pragma: no cover - l'audit ne doit jamais bloquer
        db.session.rollback()


def register_routes(app: Flask) -> None:

    # ------------------------------------------------------------------ #
    # Pages
    # ------------------------------------------------------------------ #
    @app.get("/")
    def index():
        # Le bouton "⚙ Admin" et les modales associées ne sont rendus que
        # si le visiteur arrive par le lien d'accès admin (voir plus bas)
        # OU dispose déjà d'une session admin valide (cookie) : un visiteur
        # ordinaire tombant sur "/" ne voit donc jamais qu'un espace
        # d'administration existe (l'authentification côté serveur reste
        # de toute façon la vraie protection, mais on évite d'exhiber
        # inutilement un point d'entrée public à un mot de passe).
        return render_template(
            "index.html", show_admin_ui=bool(session.get("admin_id")), asset_v=app.config["ASSET_VERSION"]
        )

    @app.get(f"/{app.config['ADMIN_ENTRY_PATH']}")
    def admin_entry():
        return render_template("index.html", show_admin_ui=True, asset_v=app.config["ASSET_VERSION"])

    # ------------------------------------------------------------------ #
    # Authentification
    # ------------------------------------------------------------------ #
    @app.post("/api/login")
    def login():
        data = request.get_json(silent=True) or {}
        username = (data.get("username") or app.config["ADMIN_USERNAME"]).strip()
        password = data.get("password") or ""
        user = AdminUser.query.filter_by(username=username).first()
        session["audit_username"] = username
        if user is None or not user.active or not user.check_password(password):
            log_audit("login.failed", target=username)
            return jsonify({"ok": False, "error": "invalid_credentials"}), 401
        session.permanent = True
        session["admin_id"] = user.id
        user.last_login_at = datetime.now(timezone.utc)
        db.session.commit()
        log_audit("login.success")
        return jsonify({"ok": True, "username": user.username, "role": user.role})

    @app.post("/api/logout")
    def logout():
        if session.get("admin_id"):
            log_audit("logout")
        session.pop("admin_id", None)
        return jsonify({"ok": True})

    @app.get("/api/me")
    def me():
        user = current_admin()
        if not user:
            return jsonify({"authenticated": False})
        return jsonify({"authenticated": True, "username": user.username, "role": user.role})

    # ------------------------------------------------------------------ #
    # Comptes administrateur (réservé au rôle "admin")
    # ------------------------------------------------------------------ #
    @app.get("/api/users")
    @admin_role_required
    def list_users():
        return jsonify([u.to_dict() for u in AdminUser.query.order_by(AdminUser.created_at).all()])

    @app.post("/api/users")
    @admin_role_required
    def create_user():
        data = request.get_json(silent=True) or {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        role = data.get("role") if data.get("role") in ("admin", "editor") else "editor"
        if not username or len(password) < 8:
            return jsonify({"ok": False, "error": "identifiant requis, mot de passe de 8 caractères minimum"}), 400
        if AdminUser.query.filter_by(username=username).first():
            return jsonify({"ok": False, "error": "ce nom d'utilisateur existe déjà"}), 409
        user = AdminUser(username=username, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        log_audit("user.create", target=username, detail=f"role={role}")
        return jsonify({"ok": True, "user": user.to_dict()})

    @app.put("/api/users/<int:user_id>")
    @admin_role_required
    def update_user(user_id: int):
        user = AdminUser.query.get(user_id)
        if user is None:
            abort(404)
        data = request.get_json(silent=True) or {}
        changes = []
        if "role" in data and data["role"] in ("admin", "editor"):
            if user.role != data["role"]:
                changes.append(f"role: {user.role} -> {data['role']}")
                user.role = data["role"]
        if "active" in data:
            new_active = bool(data["active"])
            if user.id == session.get("admin_id") and not new_active:
                return jsonify({"ok": False, "error": "vous ne pouvez pas désactiver votre propre compte"}), 400
            if user.active != new_active:
                changes.append(f"active: {user.active} -> {new_active}")
                user.active = new_active
        if data.get("password"):
            if len(data["password"]) < 8:
                return jsonify({"ok": False, "error": "mot de passe de 8 caractères minimum"}), 400
            user.set_password(data["password"])
            changes.append("password reset")
        db.session.commit()
        if changes:
            log_audit("user.update", target=user.username, detail="; ".join(changes))
        return jsonify({"ok": True, "user": user.to_dict()})

    @app.delete("/api/users/<int:user_id>")
    @admin_role_required
    def delete_user(user_id: int):
        user = AdminUser.query.get(user_id)
        if user is None:
            abort(404)
        if user.id == session.get("admin_id"):
            return jsonify({"ok": False, "error": "vous ne pouvez pas supprimer votre propre compte"}), 400
        if user.role == "admin" and AdminUser.query.filter_by(role="admin", active=True).count() <= 1:
            return jsonify({"ok": False, "error": "impossible de supprimer le dernier compte admin actif"}), 400
        username = user.username
        db.session.delete(user)
        db.session.commit()
        log_audit("user.delete", target=username)
        return jsonify({"ok": True})

    # ------------------------------------------------------------------ #
    # Journal d'audit
    # ------------------------------------------------------------------ #
    @app.get("/api/audit-log")
    @login_required
    def audit_log():
        limit = min(int(request.args.get("limit", 200)), 500)
        rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
        return jsonify([r.to_dict() for r in rows])

    # ------------------------------------------------------------------ #
    # Entrepôt de données (lecture publique)
    # ------------------------------------------------------------------ #
    @app.get("/api/warehouse")
    def get_warehouse():
        """Renvoie l'entrepôt complet, au même format que l'ancien bloc
        <script id="warehouse">, pour une compatibilité totale avec le
        front-end existant (réponse compressée gzip automatiquement).

        Une table dont `visible=False` (masquée par un compte "admin" via
        « Gérer les tables ») est retirée de la réponse pour un visiteur non
        connecté, mais reste incluse pour un compte admin/editor authentifié
        — pour qu'il puisse continuer à la consulter/la réactiver sans avoir
        à la deviner par son nom technique."""
        is_admin_session = current_admin() is not None
        meta = WarehouseMeta.singleton()
        datasets = {
            d.name: d.to_dict(with_rows=True)
            for d in Dataset.query.all()
            if is_admin_session or d.visible
        }
        resp = jsonify(
            {
                "datasets": datasets,
                "agg": meta.agg or {},
                "officiel2023": meta.officiel2023 or {},
                "stats": meta.stats or {},
                "clean": meta.clean or {},
                "generated": meta.generated or "",
            }
        )
        # Mise en cache courte côté navigateur : l'entrepôt ne change qu'à
        # la publication d'un admin, donc une réponse de quelques minutes
        # évite de retélécharger l'intégralité des données à chaque
        # navigation (ex. retour en arrière) sans risquer de servir une
        # version trop obsolète après une modification. La réponse variant
        # désormais selon l'état d'authentification (tables masquées ou
        # non), on la marque "private" pour une session admin afin qu'un
        # éventuel cache partagé (proxy/CDN) ne la resserve jamais à un
        # visiteur non connecté.
        resp.headers["Cache-Control"] = ("private, max-age=120" if is_admin_session else "public, max-age=120")
        resp.headers["Vary"] = "Cookie"
        return resp

    @app.get("/api/datasets")
    def list_datasets():
        """Métadonnées seules (sans les lignes) : utile pour un futur
        chargement paresseux (lazy-loading) ou une intégration externe,
        sans payer le coût des 18 Mo de données à chaque appel."""
        is_admin_session = current_admin() is not None
        return jsonify(
            {
                d.name: d.to_dict(with_rows=False)
                for d in Dataset.query.all()
                if is_admin_session or d.visible
            }
        )

    @app.get("/api/datasets/<name>")
    def get_dataset(name: str):
        d = Dataset.query.get(name)
        if d is None:
            abort(404)
        if not d.visible and current_admin() is None:
            abort(404)
        return jsonify(d.to_dict(with_rows=True))

    @app.put("/api/datasets/<name>")
    @login_required
    def put_dataset(name: str):
        """Créer ou remplacer un jeu de données précis, sans toucher aux
        169 autres. Corps attendu :
        {"label": "...", "cat": "faits", "desc": "...",
         "cols": [...], "types": [...], "rows": [[...], ...]}"""
        data = request.get_json(silent=True) or {}
        for required in ("cols", "types", "rows"):
            if required not in data:
                return jsonify({"ok": False, "error": f"champ manquant: {required}"}), 400
        d = Dataset.query.get(name) or Dataset(name=name)
        d.label = data.get("label", d.label or name)
        d.cat = data.get("cat", d.cat or "faits")
        d.desc = data.get("desc", d.desc or "")
        d.cols = data["cols"]
        d.types = data["types"]
        d.rows = data["rows"]
        db.session.add(d)
        db.session.commit()
        log_audit("dataset.save", target=name, detail=f"{len(d.rows)} lignes")
        return jsonify({"ok": True, "name": name, "nb_lignes": len(d.rows)})

    @app.delete("/api/datasets/<name>")
    @login_required
    def delete_dataset(name: str):
        d = Dataset.query.get(name)
        if d is None:
            abort(404)
        db.session.delete(d)
        db.session.commit()
        log_audit("dataset.delete", target=name)
        return jsonify({"ok": True})

    @app.patch("/api/datasets/<name>/visibility")
    @admin_role_required
    def set_dataset_visibility(name: str):
        """Afficher/masquer une table pour le public, sans toucher à son
        contenu. Réservé au rôle "admin" (le compte "super admin" évoqué
        dans l'espace d'administration) — un compte "editor" ne peut pas
        décider de ce que le public voit ou non, seulement en éditer le
        contenu (cohérent avec admin_role_required ailleurs)."""
        data = request.get_json(silent=True) or {}
        if "visible" not in data:
            return jsonify({"ok": False, "error": "champ manquant: visible"}), 400
        d = Dataset.query.get(name)
        if d is None:
            abort(404)
        d.visible = bool(data["visible"])
        db.session.commit()
        log_audit("dataset.visibility", target=name, detail=f"visible={d.visible}")
        return jsonify({"ok": True, "name": name, "visible": d.visible})

    # ------------------------------------------------------------------ #
    # Contenus éditoriaux (textes du site)
    # ------------------------------------------------------------------ #
    @app.get("/api/content")
    def get_content():
        sc = SiteContent.singleton()
        content = dict(sc.content or {})
        content["reports"] = sc.reports or []
        return jsonify({"content": content, "version": sc.version})

    @app.put("/api/content")
    @login_required
    def put_content():
        """Enregistre & publie les modifications de texte faites en mode
        admin (équivalent du bouton 'Enregistrer & publier'). Le front-end
        renvoie toujours l'objet 'content' complet, mais on fusionne
        (deep-merge) plutôt que de remplacer intégralement : un appel API
        qui ne fournirait qu'une partie des sections (ex: juste 'about')
        ne risque donc pas d'effacer le reste du contenu public. Un
        historique est conservé pour permettre un retour arrière."""
        data = request.get_json(silent=True) or {}
        content = data.get("content")
        if not isinstance(content, dict):
            return jsonify({"ok": False, "error": "content JSON attendu"}), 400
        sc = SiteContent.singleton()
        reports = content.pop("reports", None)
        sc.content = _deep_merge(dict(sc.content or {}), content)
        if reports is not None:
            sc.reports = reports
        sc.version += 1
        editor = current_admin()
        editor_name = editor.username if editor else "?"
        db.session.add(sc)
        db.session.add(ContentRevision(content=sc.content, reports=sc.reports, editor=editor_name))
        db.session.commit()
        log_audit("content.publish", target=f"v{sc.version}")
        return jsonify({"ok": True, "version": sc.version})

    @app.get("/api/content/history")
    @login_required
    def content_history():
        revs = (
            ContentRevision.query.order_by(ContentRevision.created_at.desc()).limit(20).all()
        )
        return jsonify(
            [{"id": r.id, "editor": r.editor, "created_at": r.created_at.isoformat()} for r in revs]
        )

    @app.post("/api/content/history/<int:rev_id>/restore")
    @login_required
    def restore_revision(rev_id: int):
        rev = ContentRevision.query.get(rev_id)
        if rev is None:
            abort(404)
        sc = SiteContent.singleton()
        sc.content = rev.content
        sc.reports = rev.reports
        sc.version += 1
        db.session.add(sc)
        db.session.commit()
        log_audit("content.restore", target=f"rev#{rev_id} -> v{sc.version}")
        return jsonify({"ok": True, "version": sc.version})

    # ------------------------------------------------------------------ #
    # Géographie (carte des provinces)
    # ------------------------------------------------------------------ #
    @app.get("/api/geo")
    def get_geo():
        """Renvoie l'objet géographique complet (geometry, layers, provinces,
        terr_geom, prov_ref) tel qu'attendu par le front-end (variable GEO)."""
        gl = GeoLayer.singleton()
        resp = jsonify(gl.geometry)  # None si aucune couche n'a encore été importée
        resp.headers["Cache-Control"] = "public, max-age=300"
        return resp

    # ------------------------------------------------------------------ #
    # Santé (utile pour les sondes de déploiement / load balancer)
    # ------------------------------------------------------------------ #
    @app.get("/healthz")
    def healthz():
        return jsonify({"status": "ok"})


def register_cli(app: Flask) -> None:
    """Commandes `flask` pratiques pour l'exploitation courante."""

    @app.cli.command("init-db")
    def init_db_command():
        """Crée les tables (sans importer de données)."""
        with app.app_context():
            db.create_all()
        print("Base de données initialisée.")

    @app.cli.command("reset-admin-password")
    def reset_admin_password_command():
        """Réinitialise le mot de passe admin depuis ADMIN_PASSWORD (.env)."""
        with app.app_context():
            user = AdminUser.query.filter_by(username=app.config["ADMIN_USERNAME"]).first()
            if user is None:
                user = AdminUser(username=app.config["ADMIN_USERNAME"], role="admin")
                db.session.add(user)
            user.set_password(app.config["ADMIN_PASSWORD"])
            db.session.commit()
            click.echo(f"Mot de passe réinitialisé pour {user.username}.")

    @app.cli.command("create-admin")
    @click.argument("username")
    @click.argument("password")
    @click.option(
        "--role", default="editor",
        type=click.Choice(["admin", "editor"]),
        help="Rôle du compte (défaut: editor).",
    )
    def create_admin_command(username: str, password: str, role: str) -> None:
        """Crée (ou met à jour) un compte administrateur nominatif.

        Exemple :
            flask create-admin jkayembe "un mot de passe solide" --role admin

        C'est la façon recommandée d'ajouter des comptes individuels plutôt
        que de partager un seul mot de passe (voir README, « Sécurité
        admin »). Un compte 'admin' peut ensuite créer/gérer les autres
        comptes directement depuis l'interface (« Gérer les comptes »)."""
        if len(password) < 8:
            raise click.ClickException("Le mot de passe doit faire au moins 8 caractères.")
        with app.app_context():
            user = AdminUser.query.filter_by(username=username).first()
            created = user is None
            if user is None:
                user = AdminUser(username=username)
            user.role = role
            user.active = True
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            click.echo(f"Compte {'créé' if created else 'mis à jour'} : {username} (rôle: {role}).")

    @app.cli.command("list-admins")
    def list_admins_command() -> None:
        """Liste les comptes administrateur existants (sans les mots de passe)."""
        with app.app_context():
            users = AdminUser.query.order_by(AdminUser.created_at).all()
            if not users:
                click.echo("Aucun compte administrateur.")
                return
            for u in users:
                statut = "actif" if u.active else "désactivé"
                click.echo(f"- {u.username} · rôle: {u.role} · {statut} · créé le {u.created_at}")


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
