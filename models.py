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
    """Comptes administrateur nominatifs autorisés à éditer le contenu
    public. Chaque compte a un rôle :
      - "admin"  : peut tout faire, y compris gérer les autres comptes ;
      - "editor" : peut éditer les contenus/données mais pas gérer les
                   comptes ni consulter le journal d'audit dans son
                   intégralité (voir app.py: admin_role_required)."""

    __tablename__ = "admin_user"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="editor")
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    last_login_at = db.Column(db.DateTime, nullable=True)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }


class AuditLog(db.Model):
    """Journal d'audit : qui a fait quoi, quand. Alimenté par app.py à
    chaque connexion et à chaque action de modification (contenu, jeux de
    données, rapports, comptes). Consultable en mode admin via
    « Journal d'activité ». Une entrée conservée même si le compte auteur
    est supprimé par la suite (on garde le nom d'utilisateur en texte)."""

    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    action = db.Column(db.String(60), nullable=False)   # ex: "content.publish"
    target = db.Column(db.String(255), default="")       # ex: nom de table, id de rapport
    detail = db.Column(db.Text, default="")
    ip = db.Column(db.String(64), default="")
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "action": self.action,
            "target": self.target or "",
            "detail": self.detail or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
