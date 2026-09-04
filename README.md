# TransparenceRDC — version Python (Flask) front-end + back-end

Cette application reprend le tableau de bord **TransparenceRDC** (entrepôt de
données ITIE-RDC) qui existait à l'origine comme **une seule page HTML
autonome** (données, styles et logique JavaScript intégrés dans le fichier),
et la transforme en une véritable application **client / serveur en
Python** :

- **Back-end** : Flask + SQLAlchemy (base SQLite par défaut). Toutes les
  données (170 jeux de données de l'entrepôt, textes du site, GeoJSON des
  provinces) sont stockées en base et exposées via une API JSON.
- **Front-end** : le même HTML/CSS/JS que l'original (graphiques, carte,
  explorateur de tables, générateur de visualisations...), simplement
  modifié pour aller chercher ses données via l'API au lieu de les lire
  depuis des balises `<script>` intégrées.
- **Administration** : mot de passe vérifié **côté serveur** (haché avec
  Werkzeug), session cookie sécurisée, et un vrai bouton "Enregistrer &
  publier" qui écrit en base de données (avec historique des publications).

## Arborescence du projet

```
transparencerdc/
├── app.py                # Application Flask : routes API + page HTML
├── config.py              # Configuration (variables d'environnement)
├── models.py              # Modèles SQLAlchemy (Dataset, SiteContent, ...)
├── import_data.py         # Script d'import / ré-import des données en base
├── wsgi.py                # Point d'entrée pour gunicorn (production)
├── requirements.txt
├── .env.example            # Modèle de fichier de configuration
├── data/
│   ├── warehouse.seed.json # Les 170 jeux de données ITIE (import initial)
│   ├── content.seed.json   # Textes du site (import initial)
│   ├── geo.seed.json       # GeoJSON provinces/territoires (import initial)
│   ├── logo.seed.txt       # Logo encodé en base64 (import initial)
│   └── transparencerdc.db  # Base SQLite (créée au premier import, à ne pas versionner)
├── static/
│   ├── style.css           # Styles (identiques à l'original)
│   ├── app.js              # Logique front-end (adaptée pour appeler l'API)
│   └── logo.png             # Logo décodé (généré par import_data.py)
└── templates/
    └── index.html           # Squelette HTML de la page
```

## Installation

```bash
cd transparencerdc
python3 -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Éditez .env : au minimum changez ADMIN_PASSWORD et SECRET_KEY
```

## Initialiser la base de données

Au premier lancement, importez les données (créées à partir des fichiers
`data/*.seed.*` fournis) :

```bash
python import_data.py
```

Ceci va :
1. créer les tables SQLite si elles n'existent pas encore ;
2. charger les 170 jeux de données de l'entrepôt, les textes du site et le
   GeoJSON dans la base ;
3. décoder le logo en `static/logo.png` ;
4. créer le compte administrateur (`ADMIN_USERNAME` / `ADMIN_PASSWORD` du
   fichier `.env`) s'il n'existe pas déjà.

Ce script est **idempotent** : vous pouvez le relancer autant de fois que
nécessaire (par exemple pour recharger un nouvel export officiel de l'ITIE)
sans risque de dupliquer les données.

### Importer un nouvel export officiel plus tard

Si l'ITIE-RDC publie un nouvel export au même format (le fichier HTML
autonome original, avec ses blocs `<script id="warehouse">`,
`<script id="content">`, `<script id="logo">`, `<script id="geo">`), vous
pouvez le charger directement :

```bash
python import_data.py chemin/vers/nouvel_export.html
```

Toutes les tables/contenus/géographie/logo seront synchronisés avec ce
nouveau fichier.

## Lancer l'application

**En développement :**

```bash
flask --app app run --debug
```

Puis ouvrez http://127.0.0.1:5000

**En production**, avec un vrai serveur WSGI (gunicorn) derrière un reverse
proxy (nginx, Caddy...) qui gère le HTTPS :

```bash
gunicorn -w 4 -k gthread --threads 4 -b 0.0.0.0:8000 wsgi:app
```

Pensez alors à passer `SESSION_COOKIE_SECURE=1` dans `.env` (le cookie de
session admin n'est envoyé que sur HTTPS).

## Espace administrateur

Cliquez sur **⚙ Admin** en bas à droite, saisissez le mot de passe défini
dans `.env` (`ADMIN_PASSWORD`). En mode édition :

- cliquez sur n'importe quel texte marqué comme éditable (à-propos, contact,
  libellés des indicateurs, introduction...) pour le modifier directement
  dans la page ;
- **Gérer les rapports** : ajouter/modifier/supprimer les rapports publiés ;
- **Enrichir les données** : importer un CSV/JSON pour ajouter des lignes à
  une table existante (fonctionne en local dans le navigateur ; utilisez
  l'API `PUT /api/datasets/<nom>` — voir plus bas — pour le rendre
  permanent côté serveur) ;
- **Enregistrer & publier** : envoie les modifications de texte au serveur
  (`PUT /api/content`), qui les enregistre en base et garde un historique.

Pour changer le mot de passe admin après coup :

```bash
# éditez ADMIN_PASSWORD dans .env, puis :
flask --app app reset-admin-password
```

## API disponible

Toutes les routes de données sont en JSON.

| Méthode | Route                              | Description                                                   | Auth requise |
|---------|-------------------------------------|-----------------------------------------------------------------|:---:|
| GET     | `/api/warehouse`                   | Entrepôt complet (tous les jeux de données + agrégats globaux) | non |
| GET     | `/api/datasets`                    | Métadonnées de tous les jeux de données (sans les lignes)       | non |
| GET     | `/api/datasets/<nom>`              | Un jeu de données complet (colonnes, types, lignes)             | non |
| PUT     | `/api/datasets/<nom>`              | Créer / remplacer un jeu de données                             | oui |
| DELETE  | `/api/datasets/<nom>`              | Supprimer un jeu de données                                     | oui |
| GET     | `/api/content`                     | Textes du site + liste des rapports                             | non |
| PUT     | `/api/content`                     | Enregistrer & publier les textes (fusion, historisé)            | oui |
| GET     | `/api/content/history`             | Les 20 dernières publications                                   | oui |
| POST    | `/api/content/history/<id>/restore`| Revenir à une version précédente                                | oui |
| GET     | `/api/geo`                         | Objet géographique complet (carte des provinces)                | non |
| POST    | `/api/login`                       | `{username, password}` -> session admin                        | non |
| POST    | `/api/logout`                      | Termine la session admin                                        | non |
| GET     | `/api/me`                          | Session admin active ou non                                     | non |
| GET     | `/healthz`                         | Sonde de santé (pour load balancer / supervision)                | non |

Exemple : mettre à jour un jeu de données précis sans toucher aux autres
(pratique pour un script de mise à jour automatisé, un cron, etc.) :

```bash
curl -X POST http://localhost:5000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"votre-mot-de-passe"}' -c cookies.txt

curl -X PUT http://localhost:5000/api/datasets/fait_total_annuel \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{
    "label": "Totaux annuels",
    "cat": "faits",
    "desc": "Recettes État / paiements entreprises par exercice",
    "cols": ["id","exercice_id","recettes_etat_usd"],
    "types": ["num","str","num"],
    "rows": [[1,"CD2025", 123456789]]
  }'
```

## Pourquoi cette architecture est "optimale" et facile à faire évoluer

- **Performance** : l'entrepôt pèse ~19 Mo en JSON brut. La compression
  gzip (Flask-Compress) le ramène à ~2 Mo sur le réseau, et le logo est
  servi comme fichier statique mis en cache par le navigateur (au lieu
  d'être ré-encodé en base64 à chaque chargement de page).
- **Souplesse** : chaque jeu de données est une ligne indépendante en base
  (table `dataset`). Vous pouvez ajouter, remplacer ou supprimer UN SEUL
  jeu de données via l'API `PUT/DELETE /api/datasets/<nom>` sans jamais
  re-générer l'ensemble de l'entrepôt.
- **Sécurité** : le mot de passe administrateur n'est plus jamais comparé
  côté navigateur (l'ancienne version stockait un hash SHA-256 visible
  dans le code source JS, qu'il suffisait de casser hors-ligne). Il est
  désormais haché avec Werkzeug et vérifié côté serveur, dans une session
  signée par `SECRET_KEY`.
- **Historique** : chaque publication de contenu est conservée
  (`content_revision`), avec possibilité de restauration.
- **Portabilité** : SQLite par défaut (zéro configuration), mais il suffit
  de changer `DATABASE_URL` dans `.env` pour passer à PostgreSQL ou MySQL
  sans changer une ligne de code (SQLAlchemy).
- **Déploiement classique** : `wsgi.py` + `gunicorn` + reverse proxy
  (nginx/Caddy) fonctionnent sur n'importe quel serveur Linux, VPS, ou
  service PaaS (Render, Railway, Fly.io, PythonAnywhere...).

## Limites connues / pistes d'évolution

- Le générateur de visualisations et l'explorateur de tables chargent
  aujourd'hui l'entrepôt complet en une fois (`/api/warehouse`), comme le
  faisait la version originale. Pour des volumes encore plus importants,
  il est possible de faire évoluer `static/app.js` afin qu'il charge les
  jeux de données à la demande via `/api/datasets/<nom>` (déjà disponible
  côté API) plutôt que tout d'un coup.
- La fonction "Enrichir les données" (import CSV/JSON) reste aujourd'hui
  côté navigateur uniquement (comme dans l'original) : elle permet de
  prévisualiser et d'exporter, mais pour un enregistrement permanent côté
  serveur il faut la relier à `PUT /api/datasets/<nom>` (l'API est prête,
  il ne reste qu'à appeler `fetch()` depuis le bouton "Ajouter au jeu de
  données").
- Un seul compte administrateur est géré par défaut ; le modèle
  `AdminUser` permet cependant d'en créer plusieurs si nécessaire.
