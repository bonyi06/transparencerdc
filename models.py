"""
Modèles de la base de données de TransparenceRDC.

Choix de conception :
- Un modèle par "jeu de données" (Dataset) : chaque table de l'entrepôt ITIE
  (faits, dimensions, annexes...) est une ligne, avec ses colonnes/typages et
  ses lignes stockées en JSON. Cela permet d'ajouter, remplacer ou mettre à
  jour UN SEUL jeu de données sans toucher au reste (souplesse demandée).
- Un singleton WarehouseMeta pour les blocs globaux peu volumineux et rarement
  modifiés (agg, officiel2023, stats, clean, generated).
- Un singleton SiteContent pour tous les textes éditables du site (ce que
  l'admin modifie via le mode édition en ligne), + un historique des
  publications pour pouvoir revenir en arrière.
- Un singleton GeoLayer pour le GeoJSON des provinces.
- Un modèle AdminUser minimal (un seul compte admin, mot de passe haché).

SQLite convient très bien ici (essentiellement de la lecture, volumes
raisonnables). Pour un usage à plus grande échelle, il suffit de changer
SQLALCHEMY_DATABASE_URI (ex: PostgreSQL) sans toucher au reste du code car
tout passe par SQLAlchemy.
"""
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


class Dataset(db.Model):
    """Un jeu de données de l'entrepôt (ex: fait_reconciliation_entreprise)."""

    __tablename__ = "dataset"

    name = db.Column(db.String(120), primary_key=True)  # clé technique (ex: dim_exercice)
    label = db.Column(db.String(255), nullable=False)
    cat = db.Column(db.String(60), nullable=False, default="faits")
    desc = db.Column(db.Text, default="")
    cols = db.Column(db.JSON, nullable=False, default=list)   # ["id", "exercice_id", ...]
    types = db.Column(db.JSON, nullable=False, default=list)  # ["num", "str", ...]
    rows = db.Column(db.JSON, nullable=False, default=list)   # [[...], [...], ...]
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    def to_dict(self, with_rows: bool = True) -> dict:
        d = {
            "label": self.label,
            "cat": self.cat,
            "desc": self.desc or "",
            "cols": self.cols or [],
            "types": self.types or [],
        }
        if with_rows:
            d["rows"] = self.rows or []
        else:
            d["nb_lignes"] = len(self.rows or [])
        return d


class WarehouseMeta(db.Model):
    """Blocs globaux de l'entrepôt : agg, officiel2023, stats, clean, generated."""

    __tablename__ = "warehouse_meta"

    id = db.Column(db.Integer, primary_key=True, default=1)
    agg = db.Column(db.JSON, default=dict)
    officiel2023 = db.Column(db.JSON, default=dict)
    stats = db.Column(db.JSON, default=dict)
    clean = db.Column(db.JSON, default=dict)
    generated = db.Column(db.String(60), default="")
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    @staticmethod
    def singleton() -> "WarehouseMeta":
        obj = WarehouseMeta.query.get(1)
        if obj is None:
            obj = WarehouseMeta(id=1, agg={}, officiel2023={}, stats={}, clean={}, generated="")
            db.session.add(obj)
            db.session.commit()
        return obj


class SiteContent(db.Model):
    """Tous les textes éditables du site (brand, à-propos, contact, etc.)."""

    __tablename__ = "site_content"

    id = db.Column(db.Integer, primary_key=True, default=1)
    content = db.Column(db.JSON, nullable=False, default=dict)
    reports = db.Column(db.JSON, nullable=False, default=list)
    version = db.Column(db.Integer, nullable=False, default=1)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    @staticmethod
    def singleton() -> "SiteContent":
        obj = SiteContent.query.get(1)
        if obj is None:
            obj = SiteContent(id=1, content={}, reports=[], version=1)
            db.session.add(obj)
            db.session.commit()
        return obj


class ContentRevision(db.Model):
    """Historique des publications de contenu (permet un retour arrière)."""

    __tablename__ = "content_revision"

    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.JSON, nullable=False)
    reports = db.Column(db.JSON, nullable=False, default=list)
    editor = db.Column(db.String(120), default="admin")
    created_at = db.Column(db.DateTime, default=utcnow)


class GeoLayer(db.Model):
    """Objet géographique complet utilisé par la carte : geometry
    (FeatureCollection des provinces), layers (indicateurs par couche),
    provinces (détail par province), terr_geom (territoires), prov_ref."""

    __tablename__ = "geo_layer"

    id = db.Column(db.Integer, primary_key=True, default=1)
    geometry = db.Column(db.JSON, nullable=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    @staticmethod
    def singleton() -> "GeoLayer":
        obj = GeoLayer.query.get(1)
        if obj is None:
            obj = GeoLayer(id=1, geometry=None)
            db.session.add(obj)
            db.session.commit()
        return obj


class AdminUser(db.Model):
    """Compte(s) administrateur autorisés à éditer le contenu public."""

    __tablename__ = "admin_user"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)
