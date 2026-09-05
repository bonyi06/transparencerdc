"""
Script d'import / synchronisation des données dans la base TransparenceRDC.

Deux façons de l'utiliser :

1) Import initial (ou ré-import complet) depuis les fichiers JSON déjà
   préparés dans data/ (c'est ce que fait `python import_data.py` sans
   argument) :
     - data/warehouse.seed.json  -> table dataset + warehouse_meta
     - data/content.seed.json    -> table site_content
     - data/geo.seed.json        -> table geo_layer
     - data/logo.seed.txt        -> static/logo.png

2) Import depuis un export HTML "TransparenceRDC" complet (le fichier que
   l'on obtient via le bouton "Enregistrer & publier" de l'ancienne version
   100% front-end, ou tout futur export similaire) :
     python import_data.py chemin/vers/export.html

   Le script sait retrouver les 4 blocs <script id="warehouse|content|logo|geo">
   intégrés dans le fichier et les charge dans la base, exactement comme le
   ferait un nouvel export officiel de l'ITIE-RDC.

Ce script est idempotent : on peut le relancer autant de fois que
nécessaire (ex: quand un nouvel export officiel arrive) sans dupliquer les
données ni casser la base existante.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

from app import create_app
from config import BASE_DIR
from models import (
    AdminUser,
    ContentRevision,
    Dataset,
    GeoLayer,
    SiteContent,
    WarehouseMeta,
    db,
)

DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"


def _extract_block(html: str, block_id: str) -> str | None:
    m = re.search(rf'<script id="{block_id}"[^>]*>(.*?)</script>', html, re.S)
    return m.group(1) if m else None


def load_from_html_export(html_path: Path) -> tuple[dict, dict, str, dict | None]:
    """Relit un export HTML complet et en extrait les 4 blocs de données."""
    html = html_path.read_text(encoding="utf-8")
    warehouse_raw = _extract_block(html, "warehouse")
    content_raw = _extract_block(html, "content")
    logo_raw = _extract_block(html, "logo")
    geo_raw = _extract_block(html, "geo")

    if not warehouse_raw or not content_raw:
        raise SystemExit(
            "Fichier HTML invalide : impossible de retrouver les blocs "
            "'warehouse' et 'content' attendus."
        )

    warehouse = json.loads(warehouse_raw)
    content = json.loads(content_raw)
    logo = (logo_raw or "").strip()
    geo = json.loads(geo_raw) if geo_raw else None
    return warehouse, content, logo, geo


def load_from_seed_files() -> tuple[dict, dict, str, dict | None]:
    warehouse = json.loads((DATA_DIR / "warehouse.seed.json").read_text(encoding="utf-8"))
    content = json.loads((DATA_DIR / "content.seed.json").read_text(encoding="utf-8"))
    logo = (DATA_DIR / "logo.seed.txt").read_text(encoding="utf-8").strip()
    geo_path = DATA_DIR / "geo.seed.json"
    geo = json.loads(geo_path.read_text(encoding="utf-8")) if geo_path.exists() else None
    return warehouse, content, logo, geo


def write_logo(logo_data_uri: str) -> None:
    """Décode le logo (data:image/...;base64,XXXX) et l'écrit comme fichier
    statique (static/logo.png), servi directement par Flask avec mise en
    cache HTTP — bien plus efficace que de le renvoyer en base64 dans une
    réponse JSON à chaque chargement de page. Le gabarit templates/index.html
    référence toujours static/logo.png ; si un futur export fournit un autre
    format (svg, jpeg...), il est converti en PNG ici pour rester compatible."""
    if not logo_data_uri:
        return
    m = re.match(r"data:image/(\w+);base64,(.*)", logo_data_uri, re.S)
    if not m:
        print("! Logo ignoré : format inattendu (attendu data:image/...;base64,...)")
        return
    ext, b64 = m.group(1).lower(), m.group(2)
    raw = base64.b64decode(b64)
    out = STATIC_DIR / "logo.png"
    if ext == "png":
        out.write_bytes(raw)
    else:
        try:
            from io import BytesIO

            from PIL import Image

            Image.open(BytesIO(raw)).convert("RGBA").save(out, "PNG")
        except Exception:
            # Pillow indisponible ou format non supporté : on garde le
            # fichier original avec son extension d'origine.
            out = STATIC_DIR / f"logo.{ext}"
            out.write_bytes(raw)
            print(f"! Impossible de convertir le logo en PNG : conservé en .{ext}. "
                  f"Pensez à ajuster templates/index.html en conséquence.")
    print(f"  logo -> {out.relative_to(BASE_DIR)}")


def sync_database(warehouse: dict, content: dict, logo: str, geo: dict | None) -> None:
    datasets = warehouse.get("datasets", {})
    print(f"Import de {len(datasets)} jeux de données...")
    existing = {d.name: d for d in Dataset.query.all()}
    seen = set()
    for name, d in datasets.items():
        seen.add(name)
        row = existing.get(name) or Dataset(name=name)
        row.label = d.get("label", name)
        row.cat = d.get("cat", "faits")
        row.desc = d.get("desc", "")
        row.cols = d.get("cols", [])
        row.types = d.get("types", [])
        row.rows = d.get("rows", [])
        db.session.add(row)
    # Supprime les jeux de données qui n'existent plus dans le nouvel export.
    for name, row in existing.items():
        if name not in seen:
            db.session.delete(row)

    meta = WarehouseMeta.singleton()
    meta.agg = warehouse.get("agg", {})
    meta.officiel2023 = warehouse.get("officiel2023", {})
    meta.stats = warehouse.get("stats", {})
    meta.clean = warehouse.get("clean", {})
    meta.generated = warehouse.get("generated", "")
    db.session.add(meta)

    sc = SiteContent.singleton()
    site_content = content.get("content", {})
    sc.content = {k: v for k, v in site_content.items() if k != "reports"}
    sc.reports = site_content.get("reports", [])
    sc.version += 1
    db.session.add(sc)
    db.session.add(
        ContentRevision(content=sc.content, reports=sc.reports, editor="import_data.py")
    )

    if geo is not None:
        gl = GeoLayer.singleton()
        gl.geometry = geo  # objet complet : geometry, layers, provinces, terr_geom, prov_ref...
        db.session.add(gl)

    db.session.commit()
    write_logo(logo)
    print("Import terminé.")


def ensure_admin_user(app) -> None:
    with app.app_context():
        if AdminUser.query.count() == 0:
            user = AdminUser(username=app.config["ADMIN_USERNAME"], role="admin")
            user.set_password(app.config["ADMIN_PASSWORD"])
            db.session.add(user)
            db.session.commit()
            print(
                f"Compte admin créé : {user.username} (rôle: admin, mot de passe "
                f"défini via ADMIN_PASSWORD, voir .env). Utilisez ensuite "
                f"'flask create-admin' pour ajouter des comptes nominatifs."
            )


def main() -> None:
    app = create_app()
    with app.app_context():
        db.create_all()
        if len(sys.argv) > 1:
            html_path = Path(sys.argv[1]).expanduser().resolve()
            print(f"Lecture de l'export HTML : {html_path}")
            warehouse, content, logo, geo = load_from_html_export(html_path)
        else:
            print("Aucun fichier fourni : import depuis data/*.seed.* par défaut.")
            warehouse, content, logo, geo = load_from_seed_files()
        sync_database(warehouse, content, logo, geo)
        ensure_admin_user(app)


if __name__ == "__main__":
    main()
