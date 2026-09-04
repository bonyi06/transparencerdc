import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")  # charge .env s'il existe (sans erreur sinon)


class Config:
    """Configuration de l'application, entièrement pilotable par variables
    d'environnement (voir .env.example) pour rester facile à déployer."""

    # Clé utilisée pour signer les cookies de session (admin connecté).
    # IMPORTANT : à changer en production (valeur aléatoire longue).
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    # Base de données. Par défaut : fichier SQLite local dans data/.
    # Pour passer à PostgreSQL en production :
    #   DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/transparencerdc
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{BASE_DIR / 'data' / 'transparencerdc.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Identifiants du compte administrateur créé automatiquement si la table
    # AdminUser est vide (voir import_data.py / app.py: ensure_admin_user()).
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "change-me-now")

    # Cookies de session : True en production derrière HTTPS.
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "0") == "1"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = int(os.environ.get("SESSION_LIFETIME_SECONDS", 60 * 60 * 8))

    # Compression gzip des réponses (l'entrepôt fait ~18 Mo en JSON brut,
    # quelques Mo une fois compressé : indispensable pour rester "optimal").
    COMPRESS_MIMETYPES = [
        "text/html", "text/css", "text/xml",
        "application/json", "application/javascript",
    ]
    COMPRESS_LEVEL = 6
    COMPRESS_MIN_SIZE = 500

    JSON_SORT_KEYS = False
