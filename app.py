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

from functools import wraps

from flask import Flask, abort, jsonify, render_template, request, session
from flask_compress import Compress

from config import Config
from models import AdminUser, ContentRevision, Dataset, GeoLayer, SiteContent, WarehouseMeta, db

compress = Compress()


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_app(app)
    compress.init_app(app)

    register_routes(app)
    register_cli(app)
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


def register_routes(app: Flask) -> None:

    # ------------------------------------------------------------------ #
    # Pages
    # ------------------------------------------------------------------ #
    @app.get("/")
    def index():
        return render_template("index.html")

    # ------------------------------------------------------------------ #
    # Authentification
    # ------------------------------------------------------------------ #
    @app.post("/api/login")
    def login():
        data = request.get_json(silent=True) or {}
        username = (data.get("username") or app.config["ADMIN_USERNAME"]).strip()
        password = data.get("password") or ""
        user = AdminUser.query.filter_by(username=username).first()
        if user is None or not user.check_password(password):
            return jsonify({"ok": False, "error": "invalid_credentials"}), 401
        session.permanent = True
        session["admin_id"] = user.id
        return jsonify({"ok": True, "username": user.username})

    @app.post("/api/logout")
    def logout():
        session.pop("admin_id", None)
        return jsonify({"ok": True})

    @app.get("/api/me")
    def me():
        if not session.get("admin_id"):
            return jsonify({"authenticated": False})
        user = AdminUser.query.get(session["admin_id"])
        return jsonify({"authenticated": bool(user), "username": user.username if user else None})

    # ------------------------------------------------------------------ #
    # Entrepôt de données (lecture publique)
    # ------------------------------------------------------------------ #
    @app.get("/api/warehouse")
    def get_warehouse():
        """Renvoie l'entrepôt complet, au même format que l'ancien bloc
        <script id="warehouse">, pour une compatibilité totale avec le
        front-end existant (réponse compressée gzip automatiquement)."""
        meta = WarehouseMeta.singleton()
        datasets = {d.name: d.to_dict(with_rows=True) for d in Dataset.query.all()}
        return jsonify(
            {
                "datasets": datasets,
                "agg": meta.agg or {},
                "officiel2023": meta.officiel2023 or {},
                "stats": meta.stats or {},
                "clean": meta.clean or {},
                "generated": meta.generated or "",
            }
        )

    @app.get("/api/datasets")
    def list_datasets():
        """Métadonnées seules (sans les lignes) : utile pour un futur
        chargement paresseux (lazy-loading) ou une intégration externe,
        sans payer le coût des 18 Mo de données à chaque appel."""
        return jsonify({d.name: d.to_dict(with_rows=False) for d in Dataset.query.all()})

    @app.get("/api/datasets/<name>")
    def get_dataset(name: str):
        d = Dataset.query.get(name)
        if d is None:
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
        return jsonify({"ok": True, "name": name, "nb_lignes": len(d.rows)})

    @app.delete("/api/datasets/<name>")
    @login_required
    def delete_dataset(name: str):
        d = Dataset.query.get(name)
        if d is None:
            abort(404)
        db.session.delete(d)
        db.session.commit()
        return jsonify({"ok": True})

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
        db.session.add(sc)
        db.session.add(ContentRevision(content=sc.content, reports=sc.reports, editor="admin"))
        db.session.commit()
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
        return jsonify({"ok": True, "version": sc.version})

    # ------------------------------------------------------------------ #
    # Géographie (carte des provinces)
    # ------------------------------------------------------------------ #
    @app.get("/api/geo")
    def get_geo():
        """Renvoie l'objet géographique complet (geometry, layers, provinces,
        terr_geom, prov_ref) tel qu'attendu par le front-end (variable GEO)."""
        gl = GeoLayer.singleton()
        return jsonify(gl.geometry)  # None si aucune couche n'a encore été importée

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
        import click

        with app.app_context():
            user = AdminUser.query.filter_by(username=app.config["ADMIN_USERNAME"]).first()
            if user is None:
                user = AdminUser(username=app.config["ADMIN_USERNAME"])
                db.session.add(user)
            user.set_password(app.config["ADMIN_PASSWORD"])
            db.session.commit()
            click.echo(f"Mot de passe réinitialisé pour {user.username}.")


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
