"""Point d'entrée pour un serveur WSGI de production (gunicorn, uwsgi...).

Exemple :
    gunicorn -w 4 -k gthread --threads 4 -b 0.0.0.0:8000 wsgi:app
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run()
