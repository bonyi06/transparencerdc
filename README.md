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

L'espace administrateur n'est **plus accessible depuis la page d'accueil
publique** : aucun bouton « Admin » n'y apparaît, pour ne pas signaler
l'existence d'un accès protégé à n'importe quel visiteur (audit qualité,
sept. 2026). Pour vous connecter, ouvrez le lien dédié :

```
https://votre-site.example/gestion-admin
```

(le chemin exact est configurable via `ADMIN_ENTRY_PATH` dans `.env` — à
changer en production pour une valeur non devinable, et à ne partager que
via un canal privé, ex. le gestionnaire de mots de passe de l'équipe). Sur
cette page, le bouton **⚙ Admin** apparaît en bas à droite ; saisissez
votre identifiant et votre mot de passe nominatifs (voir § « Sécurité admin
: comptes, rôles, journal d'audit » ci-dessous — il n'y a plus un seul mot
de passe partagé). Une fois connecté, la session reste active même en
revenant sur la page d'accueil normale : seul le bouton de découverte est
caché, pas votre session.

En mode édition, vous pouvez modifier **tous les aspects du site** : les
textes, les données, et les rubriques visibles au menu.

### 1. Modifier n'importe quel texte

Tout texte encadré en pointillés bleus (au survol/en mode édition) est
directement modifiable : cliquez dedans, tapez, cliquez ailleurs. Cela
couvre l'introduction de chaque page (Vue d'ensemble, Explorateur,
Visualisations, Géographie, Modèle de données, Dictionnaire, Qualité des
données, Rapports), les libellés des indicateurs-clés (KPI), la page
« À propos » (mission, gouvernance, méthodologie, contact), **et l'identité
du site** (nom du site, nom complet affiché en en-tête, sous-titre du menu
latéral, mention du pied de menu et note de bas de page) via la nouvelle
carte **« Identité du site »** visible en bas de la page « À propos »
lorsque vous êtes connecté. La page « À propos » affiche désormais aussi
une carte **« Gouvernance des données »** (dernière actualisation, version
de l'entrepôt, licence de réutilisation — demandée par l'audit qualité de
sept. 2026), éditable de la même façon ; pensez à mettre à jour la date et
la version à chaque nouvel import de données (`python import_data.py`).
Ces textes sont stockés dans `SiteContent` et
n'importe lequel peut être étendu de la même façon (voir § « Ajouter un
nouveau texte éditable » plus bas).

Une fois vos modifications faites, cliquez **Enregistrer & publier** : tout
est envoyé en un seul appel à `PUT /api/content`, enregistré en base
(avec historique), et le menu / en-tête / pied de page se mettent à jour
immédiatement sans recharger la page.

### 2. Choisir les rubriques affichées au menu

Bouton **Gérer les rubriques** : cochez/décochez chaque rubrique du menu
(Visualisations, Explorateur, Géographie, Modèle de données, Dictionnaire,
Qualité des données, Rapports, À propos). Une rubrique décochée disparaît
du menu **pour les visiteurs** (elle redirige automatiquement vers la
première rubrique encore visible si quelqu'un a l'ancien lien en favori) ;
en mode administrateur, elle reste visible dans le menu mais grisée avec
une étiquette « MASQUÉE », pour que vous puissiez continuer à y accéder et
la modifier. « Vue d'ensemble » ne peut pas être masquée (c'est la page
d'accueil). Ce réglage est stocké dans `content.nav_hidden` (un simple
tableau des identifiants de rubrique à cacher) et publié avec **Enregistrer
& publier** comme n'importe quel autre texte.

### 3. Mettre à jour les données

Deux façons de modifier les 170 jeux de données de l'entrepôt, sans jamais
toucher à l'API à la main :

- **Directement dans l'Explorateur** : ouvrez une table, chaque cellule
  devient éditable (cliquez, modifiez, cliquez ailleurs). Le bouton **+
  Ligne** ajoute une ligne vide en fin de table, le bouton **✕** sur chaque
  ligne la supprime (avec confirmation). Une fois les changements faits,
  cliquez **💾 Enregistrer cette table en base** : la table complète est
  envoyée via `PUT /api/datasets/<nom>` et remplace la version précédente
  en base — sans toucher aux 169 autres tables.
- **Enrichir les données** (import en masse) : toujours accessible depuis
  la barre d'administration. Choisissez une table cible, téléchargez le
  modèle CSV pour respecter les colonnes attendues, puis importez votre
  fichier CSV/JSON. Un aperçu des 20 premières lignes s'affiche ; cliquez
  **Ajouter au jeu de données**. En mode administrateur connecté, les
  lignes importées sont désormais **enregistrées automatiquement en base**
  (elles ne restent plus seulement dans le navigateur comme dans la version
  d'origine) — un message confirme le succès ou vous invite à réessayer
  depuis l'Explorateur en cas d'échec réseau.

Pour une mise à jour scriptée/automatisée (cron, import périodique depuis
un autre système), l'API `PUT /api/datasets/<nom>` reste disponible
directement (voir § API plus bas) — c'est ce que les deux mécanismes
ci-dessus utilisent en coulisses.

### 4. Sécurité admin : comptes nominatifs, rôles, journal d'audit

Un audit qualité (sept. 2026) relevait qu'un unique mot de passe partagé ne
permet pas de savoir qui a modifié quoi, ni quand. Ce n'est plus le cas :

- **Comptes nominatifs** : chaque personne a son propre identifiant/mot de
  passe (table `AdminUser`). Pour créer un compte :
  ```bash
  flask --app app create-admin jkayembe "un mot de passe d'au moins 8 caractères" --role admin
  # --role editor (par défaut) pour un compte qui édite sans pouvoir gérer les autres comptes
  flask --app app list-admins   # liste les comptes existants
  ```
  Un compte de rôle **admin** peut ensuite créer/gérer les autres comptes
  directement depuis l'interface, bouton **Gérer les comptes** dans la
  barre d'administration (rôle, activation/désactivation, réinitialisation
  de mot de passe, suppression — jamais de son propre compte, et jamais le
  dernier compte admin actif, pour ne pas se retrouver bloqué dehors).
  Un compte **editor** peut modifier les contenus/données mais pas gérer
  les comptes ni voir/gérer plus que le journal d'audit en lecture.
- **Journal d'audit** : bouton **Journal d'activité** — historique des 200
  dernières actions (connexions réussies/échouées, publication de contenu,
  restauration d'une version, enregistrement/suppression d'un jeu de
  données, création/modification/suppression d'un compte), chacune horodatée
  et attribuée au compte qui l'a effectuée (table `AuditLog`, API
  `GET /api/audit-log`). L'historique de publication de contenu existant
  (`GET /api/content/history`) attribue désormais lui aussi chaque révision
  au bon compte (auparavant, tout était enregistré sous le libellé
  générique `"admin"`).
- **Migration depuis l'ancien mot de passe unique** : le compte
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` de `.env` continue de fonctionner (créé
  automatiquement avec le rôle `admin` au premier import) — pour le
  réinitialiser :
  ```bash
  # éditez ADMIN_PASSWORD dans .env, puis :
  flask --app app reset-admin-password
  ```
  mais il est recommandé de créer un compte nominatif par personne avec
  `create-admin` et de réserver le compte partagé à la récupération
  d'urgence uniquement.

Ce système reste volontairement simple (pas de MFA, pas de SSO) : pour un
usage à enjeu plus élevé, les points d'extension naturels sont l'ajout d'un
TOTP (bibliothèque `pyotp`) sur `POST /api/login`, ou un fournisseur
d'identité externe (OAuth/SSO) devant les mêmes routes.

### 5. Afficher / masquer une table (rôle admin uniquement)

Demande de sept. 2026 : le compte « super admin » (rôle `admin`) doit
pouvoir décider quelles tables restent visibles pour le public, sans avoir
à en supprimer le contenu. Bouton **Gérer les tables** dans la barre
d'administration (visible uniquement pour un compte de rôle `admin`,
comme **Gérer les comptes**) :

- Chaque table de l'entrepôt a désormais un indicateur `visible`
  (colonne `Dataset.visible`, `true` par défaut — une table déjà publiée
  avant cette fonctionnalité reste donc visible sans action).
- Décocher une table dans **Gérer les tables** la masque immédiatement :
  elle disparaît de `/api/warehouse` et `/api/datasets` pour un visiteur
  non connecté (donc du menu, de l'Explorateur, des Visualisations, du
  Modèle de données et de la Géographie côté public), mais **rien n'est
  supprimé** — un compte admin ou editor connecté continue de la voir et
  peut la réactiver à tout moment.
- API : `PATCH /api/datasets/<nom>/visibility` avec `{"visible": true|false}`,
  réservé au rôle `admin` (même garde que la gestion des comptes).
- `python import_data.py` ne touche jamais à cet indicateur : relancer
  l'import après une correction de données ne réaffiche pas une table que
  vous aviez masquée.

## API disponible

Toutes les routes renvoient du JSON (sauf `GET /` et `GET /<ADMIN_ENTRY_PATH>`,
qui rendent la page HTML). Trois niveaux d'auth existent :

- **non** : accessible sans session.
- **session** : nécessite une session admin valide, n'importe quel rôle
  (`admin` ou `editor`) — décorateur `login_required`. Sans session : `401`.
- **rôle admin** : nécessite une session admin *et* `role == "admin"` —
  décorateur `admin_role_required`. Sans session : `401` ; session `editor` :
  `403` (authentifié mais pas autorisé — les deux codes sont volontairement
  distincts, voir `app.py`).

L'authentification repose sur un cookie de session signé (Flask `session`,
`SECRET_KEY`) : pas de jeton Bearer/API key. Pour scripter un appel
authentifié, s'authentifier une fois via `POST /api/login` avec un
cookie-jar (`-c cookies.txt`), puis réutiliser ce cookie-jar (`-b
cookies.txt`) sur les appels suivants — voir les exemples `curl` par groupe
ci-dessous.

`/gestion-admin` (chemin configurable via `ADMIN_ENTRY_PATH`) sert la même
page que `/` mais avec le bouton **⚙ Admin** visible — c'est le seul moyen
d'atteindre l'écran de connexion (voir § « Espace administrateur »).

### Authentification

| Méthode | Route          | Auth |
|---------|----------------|:---:|
| POST    | `/api/login`   | non |
| POST    | `/api/logout`  | non |
| GET     | `/api/me`      | non |

**`POST /api/login`** — corps :
```json
{"username": "jkayembe", "password": "un mot de passe solide"}
```
`username` est optionnel (repli sur `ADMIN_USERNAME` de `.env` si omis).
Réponse `200` :
```json
{"ok": true, "username": "jkayembe", "role": "admin"}
```
Réponse `401` (identifiant inconnu, compte désactivé ou mot de passe
incorrect — les trois cas renvoient la même erreur, pour ne pas indiquer à
un attaquant si un identifiant existe) :
```json
{"ok": false, "error": "invalid_credentials"}
```
Chaque tentative (réussie ou non) est consignée dans le journal d'audit
(`login.success` / `login.failed`).

**`POST /api/logout`** — aucun corps requis. Réponse `200` : `{"ok": true}`
(y compris si aucune session n'était active).

**`GET /api/me`** — indique si la session courante est authentifiée, sans
jamais renvoyer 401 (c'est la route à appeler pour savoir si un visiteur est
connecté avant d'afficher l'UI admin) :
```json
{"authenticated": true, "username": "jkayembe", "role": "admin"}
```
ou, non connecté : `{"authenticated": false}`.

```bash
curl -X POST http://localhost:5000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"votre-identifiant","password":"votre-mot-de-passe"}' \
  -c cookies.txt

curl http://localhost:5000/api/me -b cookies.txt

curl -X POST http://localhost:5000/api/logout -b cookies.txt
```

### Entrepôt de données

| Méthode | Route                            | Auth |
|---------|-----------------------------------|:---:|
| GET     | `/api/warehouse`                  | non |
| GET     | `/api/datasets`                   | non |
| GET     | `/api/datasets/<nom>`             | non |
| PUT     | `/api/datasets/<nom>`             | session |
| DELETE  | `/api/datasets/<nom>`             | session |
| PATCH   | `/api/datasets/<nom>/visibility`  | rôle admin |

**`GET /api/warehouse`** — l'entrepôt complet (équivalent de l'ancien bloc
`<script id="warehouse">`) :
```json
{
  "datasets": {
    "fait_total_annuel": {
      "label": "Totaux annuels",
      "cat": "faits",
      "desc": "...",
      "cols": ["id", "exercice_id", "recettes_etat_usd"],
      "types": ["num", "str", "num"],
      "visible": true,
      "rows": [[1, "CD2023", 123456789]]
    }
  },
  "agg": {},
  "officiel2023": {},
  "stats": {},
  "clean": {},
  "generated": "2026-09-06"
}
```
Une table dont `visible=false` est **retirée** de `datasets` pour un
visiteur non connecté, mais reste incluse pour toute session admin/editor
authentifiée (pour permettre de la retrouver et la réactiver).
Réponse : `Cache-Control: private, max-age=120` pour une session admin/editor
authentifiée, `public, max-age=120` sinon, toujours accompagné de
`Vary: Cookie` — un cache partagé (proxy/CDN) placé devant l'appli ne doit
donc jamais resservir à un visiteur anonyme une réponse générée pour une
session admin (qui peut contenir des tables masquées) ; un client qui met en
cache cette route lui-même doit tenir compte de ces deux en-têtes plutôt que
de les ignorer.

**`GET /api/datasets`** — mêmes règles de visibilité, mais métadonnées
seules (sans `rows`, avec `nb_lignes` à la place) :
```json
{"fait_total_annuel": {"label": "Totaux annuels", "cat": "faits", "desc": "...", "cols": [...], "types": [...], "visible": true, "nb_lignes": 34}}
```

**`GET /api/datasets/<nom>`** — un jeu de données complet, avec `rows`.
`404` si le nom n'existe pas, ou si la table existe mais `visible=false` et
qu'aucune session admin n'est active (le masquage se comporte comme une
absence, pas comme un accès refusé).

**`PUT /api/datasets/<nom>`** — crée le jeu de données s'il n'existe pas, le
remplace intégralement sinon (ne touche à aucun autre). Corps attendu :
```json
{
  "label": "Totaux annuels",
  "cat": "faits",
  "desc": "Recettes État / paiements entreprises par exercice",
  "cols": ["id", "exercice_id", "recettes_etat_usd"],
  "types": ["num", "str", "num"],
  "rows": [[1, "CD2025", 123456789]]
}
```
`400` si `cols`, `types` ou `rows` manque :
```json
{"ok": false, "error": "champ manquant: rows"}
```
Réponse `200` : `{"ok": true, "name": "fait_total_annuel", "nb_lignes": 1}`.
Action consignée dans le journal d'audit (`dataset.save`).

**`DELETE /api/datasets/<nom>`** — `404` si le nom n'existe pas, sinon
`{"ok": true}` (audit : `dataset.delete`).

**`PATCH /api/datasets/<nom>/visibility`** — afficher/masquer une table pour
le public sans toucher à son contenu, réservé au rôle `admin` (voir §
« Afficher / masquer une table » ci-dessus). Corps :
```json
{"visible": false}
```
`400` si `visible` est absent du corps, `404` si le nom n'existe pas.
Réponse `200` : `{"ok": true, "name": "fait_total_annuel", "visible": false}`
(audit : `dataset.visibility`).

```bash
curl -X POST http://localhost:5000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"votre-identifiant","password":"votre-mot-de-passe"}' -c cookies.txt

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

curl -X PATCH http://localhost:5000/api/datasets/fait_total_annuel/visibility \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"visible": false}'
```

### Comptes administrateur (rôle admin uniquement)

| Méthode | Route              | Auth |
|---------|--------------------|:---:|
| GET     | `/api/users`       | rôle admin |
| POST    | `/api/users`       | rôle admin |
| PUT     | `/api/users/<id>`  | rôle admin |
| DELETE  | `/api/users/<id>`  | rôle admin |

Toutes ces routes renvoient `401` sans session, `403` pour une session de
rôle `editor`.

**`GET /api/users`** — liste des comptes, triés par date de création :
```json
[{"id": 1, "username": "jkayembe", "role": "admin", "active": true, "created_at": "2026-01-10T08:00:00+00:00", "last_login_at": "2026-09-06T09:12:00+00:00"}]
```

**`POST /api/users`** — corps :
```json
{"username": "mlukusa", "password": "un mot de passe solide", "role": "editor"}
```
`role` retombe sur `"editor"` si absent ou différent de `"admin"`/`"editor"`.
`400` si `username` est vide ou `password` fait moins de 8 caractères ;
`409` si `username` existe déjà. Réponse `200` :
```json
{"ok": true, "user": {"id": 2, "username": "mlukusa", "role": "editor", "active": true, "created_at": "...", "last_login_at": null}}
```
(audit : `user.create`).

**`PUT /api/users/<id>`** — met à jour un sous-ensemble de `role`, `active`,
`password` (tout champ omis reste inchangé). `404` si l'id n'existe pas ;
`400` si on tente de désactiver son propre compte (`active: false` sur
`session["admin_id"]`) ou si `password` fait moins de 8 caractères. Réponse
`200` : `{"ok": true, "user": {...}}` (audit : `user.update`, uniquement si
un changement effectif a eu lieu).

**`DELETE /api/users/<id>`** — `404` si l'id n'existe pas ; `400` si on tente
de supprimer son propre compte, ou de supprimer le dernier compte `admin`
actif restant (`AdminUser.query.filter_by(role="admin", active=True).count()
<= 1`). Réponse `200` : `{"ok": true}` (audit : `user.delete`).

```bash
curl -X POST http://localhost:5000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"un-compte-admin","password":"..."}' -c cookies.txt

curl -X POST http://localhost:5000/api/users \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"username":"mlukusa","password":"un mot de passe solide","role":"editor"}'

curl -X PUT http://localhost:5000/api/users/2 \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"active": false}'
```

### Contenus éditoriaux

| Méthode | Route                                 | Auth |
|---------|-----------------------------------------|:---:|
| GET     | `/api/content`                          | non |
| PUT     | `/api/content`                          | session |
| GET     | `/api/content/history`                  | session |
| POST    | `/api/content/history/<id>/restore`     | session |

**`GET /api/content`** :
```json
{"content": {"about": {...}, "contact": {...}, "reports": [...]}, "version": 7}
```

**`PUT /api/content`** — corps :
```json
{"content": {"about": {"titre": "..."}}}
```
`400` si `content` n'est pas un objet JSON. Le contenu envoyé est fusionné
(deep-merge) dans le contenu existant plutôt que de le remplacer
intégralement : envoyer une seule section (ex. `about`) n'efface pas les
autres. La clé `reports`, si présente, est traitée à part (remplacée telle
quelle, pas fusionnée). Chaque publication incrémente `version` et crée une
entrée d'historique. Réponse `200` : `{"ok": true, "version": 8}` (audit :
`content.publish`).

**`GET /api/content/history`** — les 20 dernières publications :
```json
[{"id": 42, "editor": "jkayembe", "created_at": "2026-09-06T09:00:00+00:00"}]
```

**`POST /api/content/history/<id>/restore`** — `404` si l'id n'existe pas.
Restaure le contenu et les rapports de cette révision, incrémente `version`.
Réponse `200` : `{"ok": true, "version": 9}` (audit : `content.restore`).

```bash
curl -X PUT http://localhost:5000/api/content \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"content": {"about": {"titre": "À propos"}}}'

curl http://localhost:5000/api/content/history -b cookies.txt

curl -X POST http://localhost:5000/api/content/history/42/restore -b cookies.txt
```

### Journal d'audit

| Méthode | Route             | Auth |
|---------|-------------------|:---:|
| GET     | `/api/audit-log`  | session |

**`GET /api/audit-log?limit=<n>`** — `limit` par défaut 200, **plafonné à
500** quelle que soit la valeur demandée (`min(int(limit), 500)` côté
serveur) :
```json
[{"id": 1001, "username": "jkayembe", "action": "content.publish", "target": "v8", "detail": "", "created_at": "2026-09-06T09:00:00+00:00"}]
```
Accessible à toute session (`admin` ou `editor`), pas réservé au rôle admin.

```bash
curl 'http://localhost:5000/api/audit-log?limit=50' -b cookies.txt
```

### Géographie

| Méthode | Route       | Auth |
|---------|-------------|:---:|
| GET     | `/api/geo`  | non |

**`GET /api/geo`** — l'objet géographique complet attendu par la carte
(`geometry`, `layers`, `provinces`, `terr_geom`, `prov_ref`), ou `null` si
aucune couche n'a encore été importée. `Cache-Control: public, max-age=300`.

```bash
curl http://localhost:5000/api/geo
```

### Santé

| Méthode | Route       | Auth |
|---------|-------------|:---:|
| GET     | `/healthz`  | non |

**`GET /healthz`** — pour sonde de déploiement / load balancer :
```json
{"status": "ok"}
```

## Pourquoi cette architecture est "optimale" et facile à faire évoluer

- **Performance** : l'entrepôt pèse ~19 Mo en JSON brut. La compression
  gzip (Flask-Compress) le ramène à ~2 Mo sur le réseau, le logo est servi
  comme fichier statique mis en cache par le navigateur (au lieu d'être
  ré-encodé en base64 à chaque chargement de page), et `/api/warehouse`,
  `/api/geo` ainsi que tous les fichiers `static/*` renvoient désormais un
  en-tête `Cache-Control` (voir § « Performance : mise en cache HTTP »
  ci-dessous) pour accélérer les visites répétées.
- **Souplesse** : chaque jeu de données est une ligne indépendante en base
  (table `dataset`). Vous pouvez ajouter, remplacer ou supprimer UN SEUL
  jeu de données via l'API `PUT/DELETE /api/datasets/<nom>` sans jamais
  re-générer l'ensemble de l'entrepôt.
- **Sécurité** : les mots de passe administrateur ne sont plus jamais
  comparés côté navigateur (l'ancienne version stockait un hash SHA-256
  visible dans le code source JS, qu'il suffisait de casser hors-ligne).
  Ils sont désormais hachés avec Werkzeug et vérifiés côté serveur, dans
  une session signée par `SECRET_KEY` — avec des comptes nominatifs, des
  rôles et un journal d'audit (voir § « Sécurité admin » plus haut), et un
  point d'entrée non exposé publiquement (voir § « Espace administrateur »).
- **Historique** : chaque publication de contenu est conservée
  (`content_revision`), avec possibilité de restauration, attribuée au bon
  compte.
- **Portabilité** : SQLite par défaut (zéro configuration), mais il suffit
  de changer `DATABASE_URL` dans `.env` pour passer à PostgreSQL ou MySQL
  sans changer une ligne de code (SQLAlchemy).
- **Déploiement classique** : `wsgi.py` + `gunicorn` + reverse proxy
  (nginx/Caddy) fonctionnent sur n'importe quel serveur Linux, VPS, ou
  service PaaS (Render, Railway, Fly.io, PythonAnywhere...).

## URLs partageables

Un audit qualité (sept. 2026) relevait qu'une vue précise de l'Explorateur,
des Visualisations ou de la Géographie ne pouvait pas être partagée : deux
personnes voyant la même chose devaient reproduire manuellement les mêmes
clics. Ce n'est plus le cas : l'adresse du navigateur reflète maintenant en
permanence le module affiché et son état (table sélectionnée, recherche,
tri, filtres pour l'Explorateur ; table/dimension/mesure/agrégation/type
pour les Visualisations ; regroupement et filtres pour le tableau détaillé
de la Géographie), par ex. :

```
#explorer?table=ctx_paiement_infranational_detail&q=KAMOA&annee=2023
```

Un bouton **🔗 Copier le lien** (Explorateur, Visualisations, Géographie)
copie l'adresse actuelle dans le presse-papiers ; coller ce lien dans un
nouvel onglet reproduit exactement la même vue. Techniquement, l'état est
encodé dans le fragment d'adresse (`history.replaceState`, sans polluer
l'historique de navigation à chaque frappe) ; les filtres de colonne de
l'Explorateur (potentiellement nombreux) sont encodés en base64 dans le
paramètre `f` pour rester compacts, tandis que la table, la recherche,
l'année et le tri restent lisibles directement dans l'URL.

## Performance : mise en cache HTTP

Deux audits qualité (sept. 2026) ont relevé un premier chargement lent
(~11-12 s « à froid » contre ~3 s « à chaud »). Deux causes distinctes,
traitées différemment :

- **Mise en veille du service d'hébergement** (offres gratuites/basiques
  Render) : c'est un comportement d'infrastructure, pas du code applicatif
  — la seule parade est de passer à un plan qui ne met pas le service en
  veille, ou d'ajouter un ping périodique externe pour le garder éveillé.
- **Poids du premier chargement des données** : `/api/warehouse` et
  `/api/geo` renvoient désormais un en-tête `Cache-Control`
  (`public, max-age=120` pour l'entrepôt, `max-age=300` pour la
  géographie). Cela évite de retélécharger l'intégralité des ~19 Mo de
  données à chaque navigation (retour en arrière, nouvel onglet) pendant la
  fenêtre de cache, sans risquer de servir une version trop obsolète après
  qu'un admin ait publié un changement. C'est une amélioration mesurable
  mais partielle : le tout premier chargement d'une session reste soumis au
  poids réel de l'entrepôt. Une refonte plus ambitieuse — charger
  uniquement les tables de faits/dimensions/contextuelles au démarrage et
  ne charger les 117 annexes brutes qu'à la demande via
  `/api/datasets/<nom>` (déjà exposé côté API) — apporterait un gain plus
  net, mais touche à la façon dont `static/app.js`, le Dictionnaire et la
  Qualité des données comptent les lignes de chaque table ; à traiter comme
  un chantier dédié plutôt que d'y toucher au milieu d'un lot de
  changements déjà large.
- **Fichiers statiques versionnés** : `app.js` et `style.css` sont servis
  avec un cache navigateur long (`STATIC_CACHE_SECONDS`, 1 jour par défaut)
  **et** un paramètre `?v=<horodatage>` (`ASSET_VERSION`, calculé une fois
  au démarrage du processus) ajouté à leur URL dans `templates/index.html`.
  Sans ce paramètre, un cache long ferait tourner certains visiteurs sur
  une version JS obsolète pendant toute la durée du cache après chaque
  déploiement — c'est exactement ce qui s'est produit en sept. 2026 : le
  correctif de sécurité admin restait invisible pour des navigateurs ayant
  mis en cache l'ancien `app.js` avant le déploiement. Comme
  `ASSET_VERSION` change à chaque redémarrage du processus (donc à chaque
  déploiement Render), l'URL change et le navigateur retélécharge
  systématiquement la bonne version, sans perdre le bénéfice du cache long
  entre deux déploiements. Si un visiteur voit un comportement qui ne
  correspond pas au code déployé, un rechargement forcé (Ctrl+Maj+R /
  Cmd+Maj+R) élimine cette hypothèse.

## Visibilité des recettes nationales (DGI, DGRAD, DGDA…)

Retour utilisateur (sept. 2026) : les flux infranationaux (province par
province) sont mis en avant par la Géographie, mais les recettes perçues
par les régies financières nationales n'apparaissaient dans aucun
graphique du tableau de bord — alors que les données existent et
représentent la majorité des recettes (`ent_revenus_entite`, colonne
`Niveau` : National ≈ 78 %, Provincial ≈ 13 %, Entreprise publique ≈ 8 %,
ETD ≈ 2 %). Deux graphiques ont été ajoutés à la Vue d'ensemble
(static/app.js, `mOverview`/`drawOverview`) :

- **Recettes par régie nationale** : classement DGI, Trésor public, DGDA,
  DGRAD, FOMIN, CAMI, CEEC, BCC… par montant cumulé
  (`nationalRegieTop()`).
- **Recettes par niveau de perception** : répartition National / Provincial
  / ETD / Entreprise publique (`revenueLevelBreakdown()`).

En construisant ces graphiques, un bug de double comptage a été trouvé et
corrigé : la colonne `Entité perceptrice harmonisée` mélange de vraies
régies avec des lignes de sous-total de la source ("Total", "Toutes
entités", "Total secteur minier"…) — les inclure dans un classement par
entité aurait affiché un faux doublon à côté de la régie qu'il recouvre
déjà. `isRollupEntityLabel()` les exclut désormais des agrégations
client (le même filtre a corrigé, au passage, une ligne "Total" qui
s'était glissée dans le classement « Principales entreprises » de la Vue
d'ensemble, calculé sur `ent_revenus_entreprise`).

**Suite (sept. 2026)** : retour utilisateur que les régies nationales
« n'apparaissaient pas dans la Géographie » et restaient peu visibles
« partout » (CAMI, FOMIN, SGH, FONAREV en particulier). Deux compléments :

- **Géographie** : une carte n'a de sens que pour une donnée géolocalisée,
  or les recettes nationales n'ont par nature aucune province associée —
  la page **Territoire** affiche donc désormais une carte « Recettes
  nationales par régie perceptrice » indépendante de la couche
  cartographique choisie, juste au-dessus de la carte, qui suit le même
  sélecteur Année/Évolution (`nationalRegieBreakdown(year)`, appelée
  depuis `drawGeo()`).
- **Une table par régie dans le générateur de visualisations** : 11
  nouveaux jeux de données ont été dérivés de `ent_revenus_entite`
  (`regie_dgi`, `regie_dgrad`, `regie_dgda`, `regie_tresor_public`,
  `regie_sgh`, `regie_cami`, `regie_fomin`, `regie_fonarev`, `regie_occ`,
  `regie_ceec`, `regie_bcc` — cat. « Entrepôt consolidé 2007-2023 »),
  chacun regroupant toutes les lignes (toutes années, tous niveaux
  ITIE) d'une régie donnée. Choix délibéré : **une table par régie**
  plutôt qu'une table par (régie × année) — un tel produit cartésien
  aurait ajouté jusqu'à une centaine de tables, dont beaucoup avec une
  seule ligne (ex. FONAREV n'a que 2 lignes au total, toutes années
  confondues) ; filtrer par année se fait déjà, dans chaque table
  régie, via la colonne `Exercice` (dimension du générateur) ou le
  sélecteur d'année global — cohérent avec le fonctionnement de toutes
  les autres tables pluriannuelles de l'entrepôt. Ces tables sont
  générées automatiquement à partir de `ent_revenus_entite` : pour
  corriger une valeur, modifier la table source puis relancer
  `python import_data.py` (voir § « Mettre à jour les données »).

**Deux anomalies trouvées en créant ces tables (sept. 2026), corrigées :**

- **2 lignes « Trésor » classées à tort sous DGI.** En construisant la table
  dédiée DGI, deux lignes très inhabituelles apparaissaient (montants en
  milliards, alors que les autres lignes DGI sont en millions) : leur
  `Libellé d'origine` était « Trésor » / « Total Trésor » (2022 et 2023),
  mais leur `Entité perceptrice harmonisée` valait « DGI » au lieu de
  « Trésor public » — une erreur de la table consolidée `ent_revenus_entite`
  elle-même (pas propre aux tables dérivées). Corrigé à la source : ces
  2 lignes (9,7 Md USD au total) sont désormais rattachées à « Trésor
  public », qui possède déjà sa propre entrée dans cette même colonne.
  Effet visible : le classement DGI (Vue d'ensemble, Géographie, tables
  dérivées) baisse d'environ 9,7 Md USD (cumul), et Trésor public apparaît
  correctement pour 2022/2023 dans la carte de Géographie par année (il
  était auparavant absent de la vue par année, ses seules recettes de ces
  deux exercices étant comptées sous DGI).
- **Année affichée avec un séparateur de milliers (« 2 022 » au lieu de
  « 2022 »).** Dans l'Explorateur, une colonne « Exercice » de type
  numérique héritait du même formatage que les montants (séparateur de
  milliers). `fmtCell()` accepte désormais un indicateur « ne pas grouper »,
  activé pour toute colonne reconnue comme une année (`isYearLikeCol()`).

## Fiabilité des tableaux (audit qualité de sept. 2026)

Un second audit (`Audit_presentation_tableaux_TransparenceRDC.xlsx`, 168
tables passées en revue) a été reçu et vérifié table par table plutôt que
pris pour argent comptant. Ce qui suit a été confirmé et corrigé dans le
code :

- **Sommes sur des champs non additifs.** `isSummableNumCol()` (static/app.js)
  excluait déjà les identifiants et les colonnes d'année/exercice, mais pas
  les taux/pourcentages (`Part`, `Écart %`…), ni les numéros de page
  (`Page`), ni certains identifiants métier qui ne suivent aucun motif
  générique (ex. `PERMIS` dans `cami_droits_miniers`, un numéro de titre
  minier que le site additionnait en `Σ PERMIS 37,0 M`). Corrigé : exclusion
  des taux/pourcentages et des pages, plus une liste d'exceptions
  `NON_SUMMABLE_OVERRIDES` pour les cas particuliers constatés. La colonne
  `Exercice` (présente sous ce nom exact dans les tables `ent_*`) est
  désormais aussi reconnue comme une année, donc jamais sommée.
- **En-têtes d'import décalés — corrigé.** Confirmé sur A17.1, A18.1, A38 et
  A41 (les 4 annexes citées par l'audit) : la ligne d'en-tête stockée était
  en réalité la première ligne de données du tableau ITIE d'origine. Un
  balayage automatique de toutes les annexes avait trouvé 27 tables
  présentant un symptôme de ce type (l'audit n'en avait vérifié que 4 en
  détail). Après vérification table par table contre les classeurs
  officiels ITIE RDC 2022 et 2023 fournis par l'ITIE-RDC, il s'est avéré que
  5 de ces 27 avaient en réalité déjà des en-têtes corrects (faux positifs
  du balayage automatique, déclenchés par du texte légitimement long) ; les
  22 restantes ont été corrigées :
  - **13 tables** avaient bien un en-tête entièrement décalé : intitulés
    reconstruits à partir des vraies lignes d'en-tête (parfois sur 2 ou 3
    niveaux fusionnés) du classeur source, et la ligne de donnée perdue
    dans le décalage a été récupérée et réinsérée (`annexe_2022_9`,
    `annexe_2022_15`, `annexe_2022_26`, `annexe_2022_31`, `annexe_2022_36`,
    `annexe_2022_55`, `annexe_2023_11`, `annexe_2023_12`,
    `annexe_2023_17_1`, `annexe_2023_18_1`, `annexe_2023_18_2`,
    `annexe_2023_38`, `annexe_2023_39`, `annexe_2023_40`, `annexe_2023_41`,
    `annexe_2023_56`, `annexe_2023_57`, `annexe_2023_60_1` — 18 au total).
    Pour `annexe_2023_17_1` et `annexe_2023_18_1`, une deuxième ligne
    (l'entreprise KAMOTO COPPER COMPANY, non déclarée) manquait carrément
    avant celle piégée dans l'en-tête ; les deux ont été récupérées
    directement depuis le classeur source.
  - **4 tables** avaient déjà des intitulés corrects pour l'essentiel, mais
    quelques cellules d'en-tête vides (colonnes fusionnées dans Excel)
    avaient été remplacées par un espace réservé (`col12`, `col17`…) : ces
    espaces réservés ont été remplacés par le vrai sous-intitulé
    (`annexe_2022_33`, `annexe_2022_49`, `annexe_2023_37`,
    `annexe_2023_59`).
  - **5 tables** n'avaient en fait rien de cassé (`annexe_2023_13`,
    `annexe_2023_14`, `annexe_2022_51`, `annexe_2022_52`, `annexe_2023_43`).
  Le bandeau d'avertissement (`UNRELIABLE_HEADER_TABLES` dans
  static/app.js) reste dans le code, prêt à resservir si un futur import
  révèle un nouveau cas, mais l'ensemble est vide : plus aucune table n'est
  actuellement signalée.
  **Important : ce correctif ne prend effet qu'après avoir relancé
  `python import_data.py` en production** (voir § « Mettre à jour les
  données après une correction » ci-dessous) — republier le code seul ne
  suffit pas, car les en-têtes sont stockés en base, pas seulement dans le
  fichier de départ.
- **Valeurs manquantes non distinguées de zéro.** Les jetons `N/c`, `Néant`,
  `ND`, `N/A`, `NAP` (utilisés tels quels dans les rapports sources) sont
  désormais affichés de façon lisible (« · non déclaré ») au lieu du texte
  brut, pour ne jamais être confondus avec un vrai zéro déclaré
  (`isNonDeclareToken()` / `fmtCell()`).
- **Unités et devises mélangées dans une même somme.** Quand une table a une
  colonne `Devise` ou `Unité` et que la sélection filtrée contient plusieurs
  valeurs différentes, un avertissement « ⚠ Devise mixte (n) » apparaît à
  côté des totaux affichés (`mixedUnitWarning()`), pour signaler qu'additionner
  des montants dans des unités différentes n'a pas de sens.
- **Données personnelles potentiellement sensibles.** Un balayage des noms
  de colonnes avait identifié des champs à examiner dans les annexes de
  bénéficiaire effectif et de sous-traitance (ex. `Numéro d'identification
  national` dans A13/A14 ; une ligne y porte la mention `<EXCLURE>` sur un
  nom, laissée telle quelle dans la donnée source). L'ITIE-RDC a confirmé
  que l'intégralité de ces données est publique (déclarations officielles
  du rapport ITIE) : aucun masquage n'a donc été appliqué, conformément à
  cette confirmation explicite.
- **Refonte à 3 niveaux (Synthèse / Détail / Données brutes) proposée pour
  les 168 tables.** Reste à faire, en cours de scoping — un chantier de
  cette ampleur est mené table par table plutôt que d'un bloc.
- **Catégorie « (vide) » écrasant le graphique dans le générateur de
  visualisations** (repéré sept. 2026 sur `annexe_2022_25` / Localisation,
  et `annexe_2022_40` / Flux : un bâton « (vide) » à 2,3 Md / 7 Md USD
  dominait tout le reste). Cause : `aggregate()` (static/app.js) sommait
  les lignes dont la dimension choisie est vide dans un unique bâton
  « (vide) », alors que ces lignes sont en réalité des sous-totaux ou des
  notes de bas de tableau plutôt qu'une vraie catégorie. Ces lignes sont
  désormais exclues du graphique ; un message discret sous les filtres
  indique combien de lignes ont été exclues et la masse concernée, pour
  que rien ne disparaisse silencieusement.

## Second audit externe (6 sept. 2026) — constats vérifiés et corrigés

Un audit externe du portail en production a soulevé une dizaine de points,
allant de bugs concrets à des propositions de refonte de l'architecture
publique (voir « Limites connues / pistes d'évolution » pour la partie
refonte, non traitée dans cette passe). Chaque affirmation a été vérifiée
sur le code réel avant correction plutôt que prise pour argent comptant :

- **Recherche sensible aux accents (confirmé).** « redevance minière »
  retournait 0 résultat contre 920 pour « redevance miniere ». La recherche
  plein-texte de l'Explorateur, les filtres par colonne et la recherche du
  Dictionnaire comparaient les chaînes en minuscule sans neutraliser les
  accents. Corrigé : ces trois recherches utilisent désormais
  `stripAccents()` (déjà utilisé ailleurs pour les référentiels canoniques,
  mais qui n'était pas branché à la recherche) des deux côtés de la
  comparaison.
- **Rapports en double / lien générique trompeur (confirmé).** 38 rapports
  listés pour seulement 34 adresses distinctes : les annexes 2022 et 2023
  ainsi qu'un rapport de cadrage forestier étaient chacun présents deux fois
  (mêmes fichiers, titres légèrement différents). Ces 3 doublons ont été
  fusionnés (38 → 35 rapports). Restent deux entrées légitimement
  différentes (données contextuelles vs registre de propriété réelle) qui
  pointent toutes les deux vers la page de listing générale du site source
  (le site ITIE-RDC ne publie pas encore ces deux fichiers à des adresses
  séparées) : plutôt que d'inventer des liens directs, leur bouton affiche
  désormais « ↗ Voir sur le site source » au lieu de « ↓ Télécharger », pour
  ne pas laisser croire à un téléchargement direct qui n'existe pas.
- **Page bloquée sur l'écran précédent en cas d'erreur (partiellement
  confirmé).** `Dictionnaire`/`Qualité des données` ne plantaient pas au
  moment de l'audit (leurs données existaient bien), mais le routeur ne
  protégeait pas la construction du HTML d'une page contre une exception :
  si une page échoue, le titre et l'URL changent mais le contenu reste celui
  de la page précédente — symptôme exactement décrit par l'audit. Un
  filet de sécurité générique a été ajouté (`go()` dans static/app.js) :
  toute page qui échoue affiche désormais un message d'erreur explicite au
  lieu de laisser un contenu obsolète sous un titre qui ne correspond plus.
- **Date « Dernière actualisation » figée (confirmé, cause différente de
  celle supposée).** Cette date était recopiée telle quelle depuis
  `data/warehouse.seed.json` à chaque import, donc ne bougeait pas tant que
  personne ne l'éditait manuellement dans le fichier — alors que les données
  elles-mêmes changeaient (ex. ajout des 11 tables par régie). Corrigé :
  `import_data.py` fixe désormais cette date à la date réelle de chaque
  import, pour qu'elle reflète toujours la dernière synchronisation
  effective de la base.
- **« Version de l'entrepôt : à renseigner » (pas un bug).** Ce champ est un
  texte librement éditable par un admin (mode édition, § « Modifier
  n'importe quel texte ») sans mécanisme de version automatique dans le
  projet — la valeur par défaut affichée est le comportement voulu tant que
  personne ne l'a renseigné, pas un lien cassé.
- **Écart de 168 à 149 tables entre les deux audits (non reproductible tel
  quel).** Le nombre affiché dans l'Explorateur est calculé en direct depuis
  les jeux de données réellement chargés (aucune valeur figée en dur) : il
  varie légitimement à chaque ajout/retrait de table (ex. +11 tables par
  régie cette semaine). Au moment de la vérification, l'entrepôt comptait
  179 tables / 85 349 lignes — ni 168/84 485, ni 149/76 169 : ces deux
  photographies ponctuelles ne peuvent pas être comparées sans savoir
  exactement quelles tables étaient publiées à chaque instant. Cela confirme
  cependant le besoin d'un vrai journal de version (voir pistes d'évolution)
  plutôt que de laisser deviner l'écart après coup.

### Écart de réconciliation anormal dans `fait_reconciliation_flux` / `fait_reconciliation_entreprise` (non résolu)

**Non résolu.** Contrairement aux points ci-dessus, celui-ci n'a pas été
corrigé — il est documenté ici précisément pour ne pas être découvert plus
tard en production sans trace écrite.

L'audit externe du 6 sept. 2026 relevait un « écart initial très supérieur
aux déclarations affichées » sur les tables de réconciliation État/sociétés.
Vérification faite directement sur `data/warehouse.seed.json` :

- **Le volet « sociétés » de la réconciliation est vide.** `fait_reconciliation_flux`
  (6 300 lignes) a ses colonnes `societes_initial`, `societes_ajustement` et
  `societes_final` à `null` sur les 6 300 lignes, sans exception.
  `fait_reconciliation_entreprise` (4 317 lignes) a les mêmes colonnes soit à
  `null`, soit à exactement `0.0` — jamais une autre valeur. Dans les deux
  tables, une vraie réconciliation « État déclaré vs Sociétés déclarées » est
  donc actuellement impossible à calculer : le côté « sociétés » n'existe
  simplement pas dans la donnée importée.
- **`difference_initiale`/`difference_finale` sont incohérentes avec
  `etat_initial`/`etat_final` de la même ligne, sur un nombre significatif de
  lignes.** Exemples concrets (colonnes brutes, devise USD) :
  - `fait_reconciliation_flux`, "Droits et Taxes A L'Exportation (Totale
    Quittance)", exercice TSL2022 : `etat_initial` = 328 989 202 USD mais
    `difference_initiale` = 452 861 744 743 USD (environ 1 400 fois plus).
  - `fait_reconciliation_entreprise`, "SOCIETE MINIERE DE BISUNZU", exercice
    TSL2019 : `etat_initial` = 1 323 172 USD mais `difference_initiale`
    = 609 722 859 USD (environ 460 fois plus).
  - `fait_reconciliation_flux`, "Impot sur les benefices et Profits (ou Impot
    Special Forfetaire)", exercice TSL2015 : `etat_initial` = 258 948 USD mais
    `difference_initiale` = 436 567 928 USD (environ 1 700 fois plus).
  Une vingtaine d'autres lignes présentent le même symptôme (`difference_*`
  supérieure de plusieurs ordres de grandeur à `etat_*` sur la même ligne).
  Sommée sur l'ensemble des lignes, `difference_initiale` totalise environ
  **622 milliards USD** dans `fait_reconciliation_flux` (et un montant du
  même ordre, environ 622 milliards USD également, dans
  `fait_reconciliation_entreprise`) — un chiffre qui dépasse de très loin les
  recettes extractives nationales de n'importe quelle année, et qui est très
  exactement l'anomalie signalée par l'audit du 6 sept. 2026.
- **`etat_initial`, `etat_final` et `etat_ajustement` restent, eux, cohérents
  entre eux** : `Σ etat_final − Σ etat_initial = Σ etat_ajustement` exactement,
  vérifié sur les deux tables (ex. `fait_reconciliation_flux` :
  30 572 197 856 − 30 152 036 506 = 420 161 350, qui correspond très
  précisément à la somme de `etat_ajustement`). Ces trois colonnes sont donc
  fiables et utilisables telles quelles comme chiffres de synthèse.
- **Cause non identifiée.** Cet écart préexiste à ce lot de corrections — il
  fait partie de l'import consolidé d'origine, pas d'une régression introduite
  récemment. Deux hypothèses possibles, à vérifier auprès de la source, sans
  privilégier l'une par rapport à l'autre : une confusion d'unité/devise dans
  les colonnes `difference_*` lors de l'export TSL d'origine, ou une valeur
  calculée obsolète laissée par une version antérieure des données.
- **Recommandation pour toute page « Réconciliation ».** Tant que la cause
  n'est pas confirmée et corrigée à la source, toute vue publique de
  réconciliation devrait s'appuyer sur `etat_initial`/`etat_final`/
  `etat_ajustement` (fiables, cf. ci-dessus) plutôt que sur une simple somme
  de `difference_initiale`/`difference_finale`. Si ces dernières doivent tout
  de même être affichées ligne par ligne, prévoir un plafond de vraisemblance
  par ligne et/ou un indicateur explicite « donnée non fiable » plutôt que de
  les laisser se fondre silencieusement dans un total. Comme pour les autres
  limites de données de ce projet (voir § « Fiabilité des tableaux »), cette
  limite doit être signalée au lecteur plutôt que masquée.

### Mettre à jour les données après une correction

Les corrections d'en-têtes/lignes ci-dessus modifient `data/warehouse.seed.json`
(le fichier de départ), pas directement la base de production. Comme
`import_data.py` est **idempotent et écrase chaque jeu de données par son
nom** (voir sa docstring), il suffit de le relancer une fois après le
déploiement du code pour que les nouvelles données prennent effet :

```bash
python import_data.py
```

**Attention** : cette commande réécrit entièrement le contenu de chaque
table présente dans `data/warehouse.seed.json` — toute modification faite
depuis l'interface d'administration (édition de cellule, enrichissement de
données) sur une table du même nom serait alors perdue. À n'utiliser que
juste après un déploiement de correctif comme celui-ci, pas en routine.

## Simplification des tableaux et amélioration accessibilité/mobile (6 sept. 2026)

Suite au second audit externe ci-dessus, une refonte complète avait d'abord
été construite pour traiter ses points 3, 4 et 7 ainsi que sa section
« Architecture publique recommandée » : un mode Public/Expert avec bouton de
bascule, et 11 parcours thématiques distincts remplaçant le menu unique.
**Cette bascule de mode et ces 11 parcours ont été retirés après retour de
l'utilisateur**, qui a explicitement demandé de conserver le menu unique
historique (Vue d'ensemble, Visualisations, Explorateur, Géographie, Modèle
de données, Dictionnaire, Qualité des données, Rapports, À propos) plutôt que
d'ajouter une couche supplémentaire de navigation et de pages — retour
verbatim : *« Je préfère garder la vue publique et ne pas rajouter plusieurs
couches de visualisations, ce que je veux c'est garder l'ancienne vue avec
ses options mais garder les montants finaux, pas trop des colonnes
difficiles à comprendre pour un citoyen »*.

Ce qui a été **conservé** de ce chantier, car il répond directement à cette
demande sans ajouter de couche de navigation :

- **Couche sémantique par rôle de colonne.** `columnRole()` classe chaque
  colonne (`id`, `year`, `page`, `pct`, `price`, `ratio`, `stock`,
  `additive`, `text`, `dimension`) et `datasetKind()` classe chaque table
  (`source`, `référentiel`, `dimension`, `fait`, `entrepôt`, `analytique`,
  `vue`) sur les 181 tables — remplace l'ancien badge binaire
  faits/contextuel du Modèle de données et du Dictionnaire, qui ne reflétait
  plus la variété réelle des tables.
- **Tables simplifiées à 7 colonnes par défaut, pour tout le monde.**
  `pickDefaultCols()` choisit, par table, les colonnes les plus lisibles
  (dimensions et montants d'abord, identifiants techniques en dernier) ;
  l'Explorateur applique cette limite par défaut sur toute table de plus de
  7 colonnes, sans distinction de mode ou de profil. Un bouton « ▤ Afficher
  toutes les colonnes » reste disponible pour qui veut la vue technique
  complète.
- **Accessibilité et mobile — amélioration réelle, pas une certification.**
  Lien d'évitement (« Aller au contenu principal »), zone de contenu
  principale identifiée (`<main>`), navigation latérale annoncée
  (`aria-label`), item de menu actif marqué `aria-current="page"`,
  libellés accessibles sur les boutons et champs qui n'avaient qu'une icône
  ou qu'un `title`, style de focus visible sur les liens/boutons/en-têtes de
  tri/champs, les 7 fenêtres modales (connexion, comptes, tables, journal,
  rapports, rubriques, enrichissement) sont maintenant de vraies boîtes de
  dialogue (`role="dialog"`, focus piégé à l'intérieur, focus restitué au
  bouton d'origine à la fermeture, fermeture au clavier via Échap déjà
  existante), graphiques dotés d'un intitulé accessible. Limite assumée et
  non cachée : les graphiques restent une image porteuse d'un intitulé, pas
  un point de données navigable au clavier un par un. Quelques ajustements
  de mise en page mobile (barre du haut, fenêtres modales, cibles tactiles)
  complètent cette passe. Aucune mention « conforme WCAG » n'a été ajoutée
  nulle part dans l'interface.

Ce qui a été **retiré**, sur demande explicite : le bouton de bascule
Public/Expert, les 11 pages thématiques (Revenus extractifs, Entreprises et
paiements, Flux et entités perceptrices, Réconciliation, Territoires et
paiements infranationaux, Production et exportations, Dépenses sociales et
environnementales, Titres/licences et propriété effective, Données
ouvertes), ainsi que la bascule galerie/générateur de l'écran Visualisations
(qui redevient une page unique, générateur + petite galerie de graphiques
prêts à l'emploi visibles ensemble, comme avant ce chantier).

## Corrections suite au retour utilisateur du 7 sept. 2026 (lisibilité et double comptage)

Après mise en production de la simplification ci-dessus, l'utilisateur a testé le
site en conditions réelles et remonté 8 points précis. Chacun a été vérifié sur
le code et les données réelles avant correction (pas de correction à l'aveugle) :

- **Double comptage confirmé dans `ent_revenus_entite` (le plus grave).**
  Vérification directe des données : pour DGI en 2022 par exemple, 2 des 7
  lignes étaient en réalité des sous-totaux d'autres lignes déjà présentes dans
  le même tableau (ex. 3,4Md + 0,1Md = une 3ᵉ ligne de 3,5Md, les trois étant
  additionnées comme si c'étaient 3 montants distincts). En élargissant la
  vérification à toute la table, **22 des 60 couples entité/année présentaient
  ce même motif** (une ligne strictement égale à la somme de deux autres lignes
  du même groupe) — 76 lignes en doublon au total. Ces 76 lignes ont été
  retirées après revue du détail (fichier de revue fourni à l'utilisateur avant
  correction), et les 11 tables `regie_*` dérivées (DGI, DGRAD, DGDA, Trésor
  public, SGH, CAMI, FOMIN, FONAREV, OCC, CEEC, BCC) régénérées en conséquence.
  Résultat : DGI 2022 passe de 17,25 milliards USD (chiffre gonflé par le
  doublon) à 10,29 milliards USD. Cette correction n'a **retiré aucune ligne
  autrement** : seules les lignes mathématiquement identiques à la somme de
  deux lignes sœurs ont été enlevées, par prudence (voir aussi
  « Fiabilité des tableaux » plus haut pour la méthodologie de ce type de
  vérification).
- **Colonnes « finales » masquées par la limite à 7 colonnes (corrigé).**
  Sur les tables de réconciliation, les colonnes intermédiaires
  (`*_initial`, `*_ajustement`, `difference_*`) passaient avant les colonnes
  du montant définitif (`*_final`) dans le choix des 7 colonnes par défaut —
  l'inverse de ce qu'un lecteur veut voir. `pickDefaultCols()` priorise
  désormais explicitement les colonnes dont le nom contient « final »,
  « définitif » ou « certifié », et relègue en dernier celles contenant
  « initial », « ajustement », « différence » ou « écart ».
- **Recettes des régies nationales par année.** Déjà en place avant ce retour
  (le graphique de Géographie suit le sélecteur Année) — corrigé
  indirectement par la correction du double comptage ci-dessus, qui faussait
  ces montants.
- **Texte de graphique illisible en copier-coller / lecteur d'écran (corrigé).**
  Les graphiques en barres exposent maintenant, en plus du rendu visuel, un
  tableau de données visuellement masqué mais lisible (copier-coller, lecteur
  d'écran) associant clairement chaque année à sa valeur.
- **Liens de rapports itierdc.net en erreur 403.** Confirmé : nos adresses
  sont correctement construites, le blocage vient du site source lui-même
  (non réparable ici). Une note discrète prévient désormais le lecteur que
  certains liens source peuvent être temporairement inaccessibles.
- **Page « À propos » trop technique (corrigé).** La liste des sources/API
  brutes est désormais repliée par défaut (« Sources techniques (API) »),
  sans qu'aucune information ne soit supprimée.
- **Aucune attribution de source sur les graphiques de la Vue d'ensemble
  (corrigé).** Chacun des 6 graphiques affiche désormais une légende
  indiquant la table source exacte.
- **52 tables d'annexes peu explicites (corrigé).** Sur les 181 tables de
  l'entrepôt, 117 sont des annexes brutes des rapports ITIE, dont 52 avaient
  des colonnes génériques (`col1`, `col2`...) ou dupliquées (`Titres (2)`,
  `%(2)`...) sans explication. Conformément à la consigne de l'utilisateur de
  ne rien masquer (toutes ces données sont publiques), aucune table n'a été
  supprimée : chacune des 52 a reçu une description réécrite expliquant
  concrètement son contenu et la signification de ses colonnes, y compris
  quand cette signification n'a pas pu être retrouvée avec certitude (auquel
  cas la description le dit honnêtement plutôt que de deviner).

## Corrections suite au troisième audit externe (7 sept. 2026)

Un troisième audit externe, très détaillé (10 sections numérotées), a noté le
portail 4/10. Comme pour les deux audits précédents, chaque affirmation a été
vérifiée directement sur le code et les données avant toute correction — et,
point important, **la proposition de l'audit de revenir à un portail « Espace
public / Espace expert » (section 10) n'a pas été mise en œuvre**, car elle
contredit directement le refus explicite de l'utilisateur, formulé la veille,
de cette même architecture à deux espaces (voir « Simplification des tableaux »
ci-dessus). Un second passage de cet audit, plus détaillé encore (avec des
exemples ligne par ligne : SONAHYDROC, Perenco Recherche, LIREX…), a permis de
confirmer et de localiser précisément le problème le plus grave qu'il
signalait. Les corrections suivantes ont été appliquées :

- **Écarts de réconciliation à plusieurs centaines de milliards USD (le plus
  grave, confirmé et corrigé).** Le résumé affiché au-dessus des tableaux
  `fait_reconciliation_entreprise` et `fait_reconciliation_flux` (table ouverte
  par défaut à l'entrée dans l'Explorateur) totalisait `Σ difference_initiale`
  à environ 621,7 et 622,6 milliards USD — sans rapport avec les recettes
  annuelles réelles (quelques milliards). Investigation détaillée : sur les
  4 317 et 6 300 lignes de ces deux tables, exactement **23 cellules**
  (concentrées sur les exercices T/SL 2022-2024, toujours là où la déclaration
  « sociétés » correspondante est manquante) affichaient une valeur dépassant
  le milliard USD alors qu'aucune des deux déclarations sous-jacentes n'atteint
  ce niveau — jusqu'à **9 126 fois** la valeur déclarée pour une seule
  entreprise (HUACHIN METAL LEACH, exercice 2022 : 42,5 M déclarés côté État,
  387,7 Md de « différence »). Comparaison avec la table `ent_reconciliation`
  (source du même rapprochement, avec citation de page/tableau ITIE d'origine)
  qui donne, pour ce même cas, un écart initial de 186,3 M USD tout à fait
  plausible : confirmation que les 23 cellules concernées sont bien corrompues
  à l'import, et non un écart réel. N'ayant pas pu reconstituer la valeur
  d'origine avec certitude, ces 23 cellules ont été vidées (valeur manquante)
  plutôt que devinées ; **aucune autre valeur n'a été modifiée**, y compris des
  écarts proportionnellement importants mais restant sous ce seuil d'un
  milliard. Résultat : la somme affichée passe de ~622 milliards à ~715
  millions et ~561 millions USD, un ordre de grandeur cohérent avec les
  montants annuels réels. Une note explicative a été ajoutée à la description
  des deux tables, et le lecteur qui a besoin d'écarts intégralement
  réconciliés et sourcés est renvoyé vers `ent_reconciliation`.
- **Encodage corrompu (« mojibake »).** 471 cellules texte de l'entrepôt
  (`ctx_propriete`, `ctx_effectif`, `ctx_production`, `ctx_exportation`,
  `ctx_structure_capital`, `dim_organisation`, `ctx_depense_sociale`,
  `fait_reconciliation_flux`…) contenaient des séquences de caractères mal
  décodées (ex. « Ã© » au lieu de « é »), issues d'un import antérieur en
  mauvais encodage. Corrigées caractère par caractère (une tentative de
  ré-encodage global UTF-8↔CP1252 a été abandonnée : elle échouait sur les
  chaînes partiellement déjà correctes).
- **Dates 1905 dans `ctx_propriete` (79 valeurs).** Confirmé : ce sont des
  numéros de série Excel mal convertis en date lors d'un import antérieur
  (`Date Mandat`, `Date d'acquisition`). Faute de pouvoir reconstituer la date
  d'origine avec certitude (deux hypothèses d'origine testées, aucune ne
  produit de date plausible), ces 79 valeurs ont été remplacées par une valeur
  manquante plutôt que devinées, avec une note explicative ajoutée à la
  description de la table.
- **Année masquée par défaut dans les dépenses sociales.** `columnRole()`
  testait la règle « identifiant » avant la règle « année », ce qui faisait
  classer `exercice_id` comme identifiant technique (masqué par défaut) plutôt
  que comme année. Corrigé : la détection d'année est désormais prioritaire.
- **Avertissement d'unités mixtes incomplet.** `mixedUnitWarning()` ne
  détectait que les colonnes nommées exactement « devise » ou « unité »,
  ratant les colonnes composées comme « Unité de volume » ou « Unité de
  valeur ». Corrigé pour détecter toute colonne dont le nom contient
  « devise » ou « unité ».
- **Années manquantes dans le graphique des recettes de l'État.** Le graphique
  « Recettes de l'État par exercice » (Vue d'ensemble) sautait 2018, 2020 et
  2021 alors que la table source (`fait_total_annuel`) les couvre sans trou.
  Complété avec les valeurs de cette table, sans toucher aux années déjà
  présentes.
- **Doublons de libellés de communes/secteurs/chefferies en Géographie
  (confirmé, ex. « COMMUNE DE SHITURU » / « COMMUNE SHITURU » / « Commune de
  Shituru »).** 24 entités (Shituru, Ruashi, Kampemba, Panda, Bukanda,
  Balamba, Bayeke, Manika, Beia, Bahunde, Buhavu, DGRHU, DPRKOR, etc.)
  apparaissaient comme des points de carte et des lignes de tableau distincts
  d'une année à l'autre à cause de simples variantes de casse ou de
  formulation du même nom. Elles sont désormais regroupées sous un unique
  libellé canonique (issu du référentiel `ref_canoniques` déjà utilisé
  ailleurs, remis en forme proprement — ex. « commune de ruashi » →
  « Commune de Ruashi »), avec fusion des montants et unification du point de
  carte pour que les vues « Évolution (cumul) » additionnent correctement le
  même lieu d'une année sur l'autre. Précision : quand la **province**
  déclarée pour une même entité change d'une année à l'autre dans les données
  brutes (rare — ex. « Commune de Shituru » rattachée au Lualaba en 2020-2021
  contre le Haut-Katanga les autres années), cette incohérence n'est **pas**
  corrigée d'office : la province telle que déclarée dans la source est
  conservée par souci de traçabilité, et une note explicite en informe
  désormais le lecteur sur la page Géographie.
- **Graphique « écart » de réconciliation (`AGG.recon_year`) marqué comme
  expérimental pour les exercices suspects.** Confirmé : pour 2015-2021, les
  montants « recettes de l'État » et « paiements des sociétés » restent du
  même ordre de grandeur, mais pour 2022 et 2024 le second explose
  (respectivement ~570 Md et ~55 Md USD contre ~6,6 Md et ~2,8 Md de recettes
  déclarées) — un ratio supérieur à 5, très probablement une erreur d'unité ou
  d'agrégation en amont dans une donnée qui n'a pas pu être recalculée de
  façon fiable à partir des tables sources actuellement disponibles (le
  script d'origine ayant produit cet agrégat n'existe plus). Plutôt que de
  masquer ou de deviner une correction, le graphique affiche désormais un
  avertissement explicite pour les années concernées, sans supprimer ni
  modifier les chiffres eux-mêmes.
- **Traçabilité des corrections (nouveau).** La page « À propos » affiche
  désormais un « Journal des modifications » recensant les corrections
  successives apportées à l'entrepôt (doublons, encodage, libellés…), en
  complément du champ « Version de l'entrepôt » déjà présent.

Points de l'audit examinés mais **non modifiés à ce stade**, faute de pouvoir
les corriger sans risque de deviner ou de masquer une donnée : l'écart entre
« 22 exercices » et « 18 années » (nomenclature ITIE historique, chaque
exercice n'est pas forcément une année civile distincte) et les éventuels
écarts résiduels entre les années des graphiques de synthèse et celles des
tableaux de détail — signalés ici pour suivi plutôt que corrigés à l'aveugle.

## Réorganisation de l'entrepôt selon la Norme ITIE 2023 (7 sept. 2026)

Après le troisième audit externe, l'utilisateur a signalé que l'entrepôt
restait « indigeste » : les 181 tables étaient présentées selon la structure
technique des fichiers sources (annexes, entrepôts consolidés, tables de
faits/dimensions...) plutôt que selon une logique de publication compréhensible
par un lecteur non technique. Sur demande explicite, et après lecture de la
Norme ITIE 2023 (Partie 1, Principes et Exigences) fournie par l'utilisateur,
l'entrepôt a été entièrement réorganisé, en une seule fois (181 tables,
nouvelle navigation complète) :

- **Une seule vue publique, désormais organisée par thème ITIE.** Le portail
  « Espace public / Espace expert » proposé par l'audit et déjà refusé
  explicitement par l'utilisateur (voir plus haut) n'a pas été réintroduit.
  À la place, les 53 tables destinées au public sont réparties en **10
  rubriques thématiques** alignées sur les exigences de la Norme ITIE 2023 :
  cadre légal/licences (2.1-2.4), propriété effective (2.5), entreprises
  publiques (2.6), production et exportations (3.2-3.3), paiements des
  entreprises et recettes de l'État (4.1), réconciliation et écarts (4.1/4.9),
  transferts et paiements infranationaux (4.6/5.2), dépenses sociales et
  environnementales (6.1), contribution économique du secteur (6.3), et
  rapports/sources/méthodologie (4.9/7.2). Chaque rubrique a sa propre page de
  navigation (`#cadre_licences`, `#propriete`, etc.), listée dans le menu
  latéral sous « Par thème ITIE ».
- **Les 128 tables techniques (annexes brutes, référentiels internes,
  tables intermédiaires) sont désormais réservées au profil administrateur**,
  et non plus mélangées aux tables publiques dans l'Explorateur, le
  Dictionnaire, la Qualité des données, le Modèle de données et le Générateur
  de visualisations. Un visiteur non connecté n'y a plus accès ; un lien
  « Voir aussi les tables techniques (connexion administrateur) » dans
  l'Explorateur ouvre directement la connexion administrateur existante — sans
  créer de second mode de navigation. Conformément à la consigne de ne rien
  supprimer, ces 128 tables restent entièrement présentes en base et
  consultables par un compte administrateur : rien n'a été effacé, seule leur
  visibilité par défaut a changé.
- **Chaque table publique porte désormais une fiche de métadonnées
  structurée** (période couverte, unité de mesure, devise, source, périmètre,
  niveau de désagrégation, statut de qualité), affichée directement au-dessus
  du tableau sur sa page thématique — au lieu d'une simple description libre.
  Ces métadonnées sont stockées avec chaque jeu de données (colonne `meta` du
  modèle `Dataset`) et la taxonomie des 11 thèmes (les 10 thèmes publics + un
  thème technique) est stockée séparément (`WarehouseMeta.theme_info`) ; les
  deux sont désormais renvoyées par `/api/warehouse`, alors qu'elles ne
  l'étaient pas dans une première version de ce travail (bug corrigé avant
  livraison : sans cette correction, le nouveau système de thèmes restait
  invisible côté serveur et toutes les pages thématiques retombaient sur la
  page « Vue d'ensemble »).
- **Aucune donnée déplacée dans l'espace administrateur n'a été supprimée ou
  modifiée** : ce travail est une réorganisation de la présentation et de la
  navigation, pas une correction de données. Les corrections de données
  décrites dans les sections d'audit ci-dessus restent inchangées et
  s'appliquent aux mêmes tables, qu'elles soient désormais publiques ou
  réservées à l'administrateur.
- **Vérification effectuée avant livraison** : contrôle de syntaxe JS et de
  validité JSON, redémarrage local du serveur Flask, et parcours automatisé
  (Playwright) des 19 pages de navigation (aperçu, géographie, visualisations,
  explorateur, modèle, dictionnaire, qualité, rapports, à propos, et les 10
  pages thématiques) sans erreur JavaScript, en visiteur anonyme puis en
  session administrateur — y compris un test de rechargement complet de page
  en étant déjà connecté, pour confirmer que l'espace technique reste
  accessible après un rafraîchissement du navigateur.

## Ajout des cahiers des charges des entreprises minières (8 sept. 2026)

L'utilisateur a transmis un fichier Excel distinct, « Résumé des cahiers des charges des entreprises minières
fait au mois de mai 2022 », avec la demande de l'intégrer intégralement, de manière structurée, dans le volet
« Dépenses sociales et environnementales » (Exigence ITIE 6.1) et de le répercuter dans la Géographie (métadonnées
et carte). Le fichier comporte deux feuilles :

- **HAUT-KATANGA 2021-2025** : 14 entreprises minières, avec pour chacune son identité (RCCM, Id-Nat, numéro(s) de
  PE/TE, validité du titre), la synthèse de ses engagements (chronogramme, durée, budget total) et le détail de
  chacun de ses projets (jusqu'à 23 par entreprise : secteur, description complète, coût).
- **LUALABA** : structurée différemment (avec en plus la province, le siège social et la superficie du titre),
  mais dont les 3 seules entreprises réellement renseignées (MMG Kinsevere, STL, Anvil Mining) déclarent
  elles-mêmes « Province : Haut-Katanga » et reprennent des projets identiques à ceux de la feuille précédente —
  signe d'une copie de travail incomplète plutôt que de données propres au Lualaba. Les 11 autres entreprises de
  cette feuille n'y apparaissent que par leur nom, sans aucune autre donnée.

Conformément au principe de ne rien masquer, **les deux feuilles sont publiées intégralement, sans fusion ni
correction de l'une par l'autre** (colonne « Feuille source »), dans deux nouvelles tables publiques :

- `ent_cahier_charges_entreprise` (28 lignes) : synthèse par entreprise.
- `ent_cahier_charges_projet` (122 lignes) : détail par projet, avec un montant extrait automatiquement du
  dernier chiffre suivi de « $ » dans chaque description (8 projets sur 112 de la feuille Haut-Katanga n'ont pas
  de montant identifiable dans leur texte et restent vides plutôt que d'être devinés).

Deux incohérences du document source ont été identifiées et **signalées plutôt que corrigées** :

- Un montant mal saisi (« 806 6121 $ » pour RUASHI MINING SAS, projet Santé) est reproduit tel quel.
- La somme des coûts unitaires des projets ne correspond pas toujours au « Budget total engagé » déclaré au
  niveau de l'entreprise (écarts notables pour STL, RUASHI MINING SAS et GRANDE CIMENTERIE DE KATANGA) — les deux
  niveaux sont publiés tels quels, sans réconciliation artificielle.

Pour la Géographie, deux nouvelles couches cartographiques ont été ajoutées (groupe « Cahiers de charge ») :
« Cahiers de charge — entreprises engagées 2021 » (14, Haut-Katanga) et « Cahiers de charge — budget engagé 2021 »
(30 169 481,22 USD, Haut-Katanga). Ces couches sont **volontairement distinctes** des couches déjà existantes
« Cahiers de charge (nb, statut CPI) » et « (dépenses sociales, $) », qui viennent des annexes officielles des
Rapports ITIE 2022-2023 et comptent les *cahiers* par statut d'approbation — une base de mesure différente qu'il
aurait été trompeur de mélanger. La feuille « LUALABA » n'a volontairement pas été utilisée pour ces agrégats
géographiques, afin d'éviter un double comptage avec la feuille Haut-Katanga.

**Mise à jour (8 sept. 2026, plus tard le même jour)** : retour utilisateur — le rendu initial (les deux tables
listées comme n'importe quel autre tableau de l'entrepôt, consultables uniquement dans l'Explorateur générique)
ne mettait pas en valeur la richesse du document malgré son niveau de détail élevé. La rubrique « Dépenses
sociales et environnementales » affiche désormais, en plus des deux tableaux bruts (toujours consultables tels
quels via un bouton dédié), une vue « Cahiers des charges » composée d'une fiche par entreprise (identité, titre
minier, chronogramme, budget engagé) avec, dépliable sous chaque fiche, le détail de ses projets (secteur, titre,
description complète, montant) ; une recherche par nom d'entreprise et des filtres par feuille source et par
secteur de projet permettent de naviguer dans les 28 entreprises et 122 projets sans dérouler un tableau à 17
colonnes. Aucune donnée n'est retirée : c'est uniquement la présentation qui change.

## Ajout du registre des contrats et licences extractifs — Exigence ITIE 2.4 (8 sept. 2026)

Demande de l'utilisateur : « rajouter les contrats miniers, pétroliers et forestiers en allant les rechercher sur
https://resourcecontracts.org/countries/cd », conformément à l'Exigence ITIE 2.4, qui impose aux pays de mise en
œuvre de divulguer, à compter du 1er janvier 2021, tous les contrats et licences octroyés, conclus ou modifiés
dans les industries extractives (et encourage la divulgation volontaire de l'ensemble des contrats, y compris
antérieurs).

Les données proviennent du **Resource Contracts Portal**, opéré par le Natural Resource Governance Institute
(NRGI) et le Columbia Center on Sustainable Investment (CCSI) — `https://resourcecontracts.org/countries/cd` —
via son API publique (`api.resourcecontracts.org`). L'intégralité des contrats déclarés pour la RDC a été
récupérée par pagination (8 pages de 100 résultats maximum) le 8 septembre 2026 : **756 contrats**, vérifiés un à
un (aucun doublon, total exactement conforme à celui renvoyé par l'API).

Ce registre constitue la nouvelle table publique `ent_contrats_extractifs` (756 lignes, 12 colonnes), rattachée à
la rubrique « Cadre légal, licences et contrats » :

- **346 contrats** relèvent de la catégorie « resource contract » (contrats miniers, pétroliers et gaziers
  proprement dits) et **410** de la catégorie « other legal contract » (baux fonciers, concessions forestières et
  documents annexes) — catégorisation reprise telle quelle depuis la source.
- **43 contrats** ont été signés à compter du 1er janvier 2021 et relèvent donc du champ **obligatoire** de
  l'Exigence 2.4 ; ils sont signalés distinctement (bandeau « Exigence 2.4 — obligatoire ») dans la nouvelle vue.
  Les **713 autres**, antérieurs à 2021, sont publiés au titre de la divulgation volontaire encouragée par l'ITIE.
- Chaque fiche renvoie, par un lien direct, vers la page du contrat sur resourcecontracts.org, qui donne accès au
  texte intégral (PDF) ; les documents eux-mêmes n'ont pas été republiés, seulement leurs métadonnées et un lien
  vers la source.

Conformément au principe de ne rien masquer : pour **252 des 756 contrats**, la source ne renseigne pas de date
de signature complète (seule l'année est parfois connue) — ce n'est pas une donnée manquante de notre fait mais
un défaut d'information de la source primaire, et la mention « Non renseignée dans la source » est affichée telle
quelle plutôt qu'une date devinée ou une ligne supprimée. De même, quelques contrats sans titre, catégorie, type
de contrat ou ressource identifiable dans la source portent la mention explicite correspondante (« non renseigné
dans la source », « non catégorisé dans la source »).

Comme pour les cahiers des charges, la rubrique « Cadre légal, licences et contrats » affiche désormais, en plus
du tableau brut des 756 lignes (toujours consultable intégralement via un bouton dédié), une vue « Contrats et
licences miniers, pétroliers et forestiers » : une fiche par contrat (catégorie, type, ressource, années/date de
signature, langue, statut au regard de l'Exigence 2.4, lien vers le texte intégral), avec recherche par titre,
filtres par catégorie / ressource / période (avant ou depuis 2021), et pagination (24 fiches par page, 756 lignes
au total).

## Audit d'optimisation du 8 sept. 2026 — feuille de route et premier volet livré

L'utilisateur a transmis un audit de la plateforme relevant dix chantiers prioritaires : performance du
chargement initial, recherche transversale réelle, traçabilité de chaque chiffre vers sa source exacte,
détection des incohérences (années/unités/doublons/valeurs manquantes ou aberrantes), export CSV/XLSX des
résultats filtrés, matrice de conformité par exigence de la Norme ITIE 2023, ergonomie (menu, mobile, filtres
dans l'URL), séparation claire sources brutes / données normalisées / agrégats / indicateurs, et identifiants
stables pour les référentiels (entreprises, régies, flux, licences, contrats, bénéficiaires effectifs).

Suivi (mis à jour à chaque volet livré) :

| Chantier | Statut |
|---|---|
| Confiance & traçabilité (source exacte de chaque tableau) | **Livré (ce volet)** |
| Recherche transversale (entreprises, régies, flux, provinces, exercices, rapports, exigences ITIE) | **Livré (ce volet)** |
| Identifiants stables (entreprises, régies, flux, provinces) | **Livré (ce volet)** — contrats/licences disposaient déjà d'un identifiant source (Open Contracting / n° PE-TE) |
| Détection et correction d'un vrai trou de données 2022/2023 (voir « Complétude 2022/2023 » ci-dessous) | **Livré le 9 sept. 2026** |
| Performance du chargement initial | Non commencé |
| Détection automatique des incohérences (années, unités, doublons, valeurs aberrantes) | Non commencé (le chantier du 9 sept. 2026 a traité un cas concret — la non-publication d'annexes 2022/2023 déjà présentes dans l'entrepôt — mais aucune détection automatique systématique n'existe encore) |
| Export CSV/XLSX des vues filtrées, avec métadonnées et licence | Non commencé |
| Matrice de conformité par exigence ITIE 2023 (preuves/lacunes/niveau) | Non commencé |
| Ergonomie (menu allégé, mobile, filtres dans l'URL) | Filtres dans l'URL déjà en place (`syncURL()`) ; menu/mobile non revus dans ce volet |
| Séparation sources brutes / données normalisées / agrégats / indicateurs | Non commencé (partiellement déjà le cas via la distinction annexes brutes ↔ tables `ent_*`/`ctx_*` publiques) |
| Identifiants stables pour les bénéficiaires effectifs | Non commencé (touche des données personnelles — à traiter avec précaution) |

### Complétude 2022/2023 (correctif du 9 sept. 2026)

Un retour utilisateur a signalé, à juste titre, que plusieurs tableaux publics n'avaient aucune donnée pour
2022 et 2023 alors que ce sont des exercices richement documentés dans les Rapports ITIE-RDC. L'investigation
a montré que les 117 annexes officielles brutes de ces deux rapports (2022 et 2023) avaient bien été importées
dans l'entrepôt, mais classées par erreur dans l'espace technique (réservé à l'administration), donc **invisibles
au public alors que la donnée existait déjà** — une violation de fait du principe « ne rien cacher, toutes ces
données sont publiques ». Correctif appliqué :

1. **113 de ces 117 annexes** ont été reclassées dans leur rubrique thématique publique naturelle (Production et
   exportations, Dépenses sociales et environnementales, Cadre légal/licences, Entreprises publiques, Propriété
   effective, Transferts infranationaux, Paiements et recettes, Réconciliation, Rapports/méthodologie,
   Contribution économique) et portent désormais un bandeau les identifiant comme annexe source brute. Les 4
   restantes (deux référentiels de flux déjà dupliqués dans `ref_canoniques`, et deux annexes au titre générique
   « Annexe 1.1 »/« Annexe 1.2 » dont le contenu réel n'a pas pu être identifié avec certitude) restent dans
   l'espace technique par prudence plutôt que d'être classées au hasard.
2. **`ctx_production`, `ctx_exportation`, `ctx_propriete` et `ctx_effectif`** (ce dernier pour 2022 seulement)
   ont été complétés avec les données réelles 2022/2023 extraites de ces mêmes annexes, avec correction des
   cellules fusionnées Excel (société/NIF répétés) et des en-têtes génériques (« col1 », « col2 »…) là où le
   fichier source les avait perdus à l'export. Aucune valeur non renseignée dans la source (« Non renseignée »,
   « NC », cellule vide) n'a été convertie en zéro : elle reste vide dans la base.
3. Pour les tableaux composites plus anciens dont la structure de colonnes n'est plus documentée de façon
   fiable (`ctx_depense_sociale`, `ctx_depense_environnementale`, `ctx_structure_capital`,
   `ctx_transaction_troc`, `ctx_participation_publique`, `ctx_paiement_infranational`, `ctx_pret_subvention`),
   **aucune correspondance incertaine n'a été forcée** entre les colonnes de l'annexe 2022/2023 et celles du
   tableau historique : chacun indique dans sa note de qualité pourquoi 2022/2023 n'y figurent pas encore et
   renvoie vers l'annexe source réelle (désormais publique) où trouver les chiffres. C'est un chantier qui reste
   ouvert et pourra être complété dans un prochain volet, une fois la correspondance colonne par colonne établie
   avec certitude — jamais par une supposition.

### Traçabilité : « Source & traçabilité » sur chaque tableau

Chaque tableau public affiche désormais, sous son bandeau de métadonnées (période/unité/devise/périmètre/
désagrégation/source déjà existant), un lien **« ⓘ Source & traçabilité de ce tableau »**. Il ouvre une fiche
récapitulant : le nom et la description complète du tableau, sa période et son périmètre, sa source (les URL
qu'elle contient deviennent des liens cliquables), la **date de dernière synchronisation complète de
l'entrepôt** (`WH.generated`, déjà suivie côté import mais jusqu'ici seulement affichée sur les pages « À
propos » et « Qualité des données ») et le repère technique interne du fichier importé (champ `tech` de chaque
jeu de données, ex. `RESOURCECONTRACTS.ORG (NRGI/CCSI) — SNAPSHOT 2026-09-08`).

Limite assumée et documentée plutôt que dissimulée : l'entrepôt est resynchronisé **intégralement** à chaque
mise à jour (`python import_data.py` réimporte les 185 jeux de données en une fois), il n'existe donc qu'une
seule date de synchronisation pour tout l'entrepôt et non une date par table ou par ligne — la fiche de
traçabilité l'indique explicitement plutôt que de laisser croire à un suivi plus fin qu'il ne l'est réellement.
Une traçabilité au niveau de la ligne ou de la cellule individuelle (rapport, page, tableau précis pour
*chaque* chiffre) existe déjà nativement pour les tables qui le permettent (`ent_titres_licences` porte par
exemple les colonnes `Rapport` / `Page` / `Tableau ou section source` pour chacune de ses lignes) mais
demanderait, pour être généralisée à l'ensemble de l'entrepôt, de reprendre l'import de chaque table source une
à une — chantier plus lourd, non traité dans ce volet.

### Recherche transversale (entreprises, régies, flux, provinces, exercices, rapports, exigences ITIE)

La barre de recherche de l'en-tête ne faisait jusqu'ici que présélectionner le texte tapé comme filtre plein
texte de l'Explorateur, sur la seule table déjà affichée — ce n'était pas une recherche transversale. Elle
propose désormais, dès la saisie, des suggestions groupées par type (entreprises, entités perceptrices/régies,
flux de paiement, provinces, exercices, rapports, exigences de la Norme ITIE 2023), construites à partir :

- des entités déjà canonicalisées dans `ref_canoniques` (voir § « Référentiels canoniques » ci-dessous) et de
  `GEO.prov_ref` pour les provinces ;
- des années détectées dans les colonnes `Exercice`/`Année` de toutes les tables publiques ;
- des rapports publiés (page Rapports) ;
- des exigences de la Norme ITIE 2023, déduites automatiquement du texte déjà affiché en en-tête de chaque
  rubrique (ex. « Exigences 2.1 à 2.4 ») plutôt que d'une liste séparée à maintenir à la main.

Sélectionner une **entreprise, une entité perceptrice ou un flux** affiche la liste réelle des tableaux publics
où elle apparaît (nombre de lignes à l'appui, calculé à la volée via la même correspondance canonique que
l'Explorateur), avec un lien direct pré-filtré vers chacun — au lieu de se limiter à un seul tableau
présélectionné à l'avance. Sélectionner un **exercice** liste les tableaux publics qui le couvrent. Sélectionner
un **rapport** ouvre la page Rapports ; une **exigence ITIE** ouvre directement la rubrique correspondante.
L'ancien comportement (Entrée = filtre plein texte sur le tableau déjà ouvert dans l'Explorateur) reste
disponible quand aucune suggestion n'est sélectionnée.

### Identifiants stables des référentiels

Nouvelle table technique `ref_identifiants_stables` (2 191 lignes : 1 050 entreprises, 1 088 entités
perceptrices, 27 flux, 26 provinces), qui attribue à chaque entité déjà canonicalisée dans `ref_canoniques` /
`GEO.prov_ref` un identifiant de la forme `entreprise:gecamines-sa`, `entite:dgi`, `flux:redevance-miniere`,
`province:haut-katanga` — dérivé du libellé canonique lui-même (slug), stable tant que ce libellé n'est pas
corrigé dans le référentiel. **Ce n'est pas un numéro d'immatriculation officiel** (RCCM, Id-Nat, code ISO) :
ces identifiants officiels, quand ils sont connus, restent publiés tels quels dans leurs tables d'origine (ex.
RCCM/Id-Nat dans les cahiers des charges, `Identifiant Open Contracting` dans le registre des contrats
extractifs, numéro PE/TE dans le cadastre minier CAMI). Cette table sert d'ancrage technique à la recherche
transversale ci-dessus ; elle est classée dans l'espace technique (non listée au public) car elle n'a pas de
valeur informative propre en dehors de cet usage de navigation.

## Limites connues / pistes d'évolution

- Le générateur de visualisations et l'explorateur de tables chargent
  aujourd'hui l'entrepôt complet en une fois (`/api/warehouse`), comme le
  faisait la version originale (voir § « Performance : mise en cache HTTP »
  ci-dessus pour la mitigation actuelle et la piste de refonte complète).
- L'édition de cellule dans l'Explorateur remplace la table entière côté
  serveur à chaque « Enregistrer cette table en base » (pas de diff ligne
  par ligne) : pour une table de plusieurs dizaines de milliers de lignes,
  préférez l'import CSV ciblé (« Enrichir les données ») pour de gros
  volumes de changements plutôt que l'édition cellule par cellule.
- Le système de comptes n'a pas de MFA ni de SSO (voir § « Sécurité admin »).
- Les doublons de la liste des rapports (ex. « Annexes 2022 » apparaissant
  deux fois) se corrigent directement dans l'interface, bouton **Gérer les
  rapports**, sans changement de code nécessaire.

## Référentiels canoniques (provinces, entreprises, flux, entités perceptrices)

Un audit qualité (septembre 2026) a relevé que les mêmes provinces,
entreprises, flux ou régies apparaissent sous plusieurs variantes dans les
données brutes (casse, accents, tirets, codes ISO, anciennes orthographes —
ex. « HAUT KATANGA », « Haut-Katanga » et « CD-HK » pour la même province),
ce qui fragmentait les filtres de l'Explorateur et les agrégations des
Visualisations. L'entrepôt contenait déjà un référentiel de correspondance
(table `ref_canoniques`, 6 166 lignes, colonnes `dimension` / `libelle_brut`
/ `nom_canonique`) mais il n'était pas branché à l'interface.

`static/app.js` construit maintenant, au chargement, une table de
correspondance à partir de `ref_canoniques` (entreprises, flux, entités
perceptrices) et de `GEO.prov_ref` (les 26 provinces de la RDC, même source
que la carte). Cette correspondance est appliquée uniquement aux colonnes
explicitement identifiées comme portant ce type de libellé, dans les tables
de faits/dimensions/contextuelles bien définies (liste `CANON_COLS` en haut
de `static/app.js`) — **jamais** aux annexes brutes, dont les en-têtes de
colonnes sont trop hétérogènes pour un rattachement fiable.

Principe important : **la valeur brute stockée en base n'est jamais
réécrite** (traçabilité des déclarations officielles, un principe central
pour une plateforme ITIE). Seules les listes de filtres de l'Explorateur et
les agrégations (Visualisations, regroupements) affichent et comptent sous
le libellé canonique ; les cellules du tableau et les exports CSV
continuent d'afficher exactement la valeur telle que déclarée à l'origine.
Une variante non répertoriée dans `ref_canoniques`/`GEO.prov_ref` (ou une
faute de frappe non couverte) reste affichée telle quelle plutôt que d'être
fusionnée à tort — mieux vaut un doublon visible qu'un faux regroupement.

Pour élargir la couverture :

- **Provinces** : ajoutez une entrée dans `PROVINCE_ALIASES` (haut de
  `static/app.js`) pour une faute de frappe à fort volume (ex. déjà fait
  pour « Tanganyka » → « Tanganyika »). Les variantes de casse/accents/
  tirets sont déjà couvertes automatiquement.
- **Entreprises / flux / entités perceptrices** : complétez la table
  `ref_canoniques` (via l'Explorateur en mode admin, ou par import
  CSV/JSON — voir « Mettre à jour les données ») avec de nouvelles paires
  `libelle_brut` → `nom_canonique`.
- **Une nouvelle colonne à canonicaliser** : ajoutez l'entrée
  `"nom_table.nom_colonne":"dimension"` dans `CANON_COLS`.

Cette correspondance est appliquée de façon cohérente à **tous** les
endroits de l'interface qui filtrent, regroupent ou comptent par province,
entreprise, flux ou entité perceptrice : l'Explorateur (filtres, sommes) et
le module Géographie (filtres et tableau « Paiements infranationaux
détaillés » de `drawInfraTable()`) partagent le même moteur de
canonicalisation (`canonDimFor`/`canonicalize`) — une correction apportée
à `ref_canoniques` ou `PROVINCE_ALIASES` se répercute donc automatiquement
partout, sans code dupliqué à maintenir à deux endroits.

Limite connue : certaines abréviations (ex. « DRLU » vs « Direction des
recettes de Lualaba (DRLU) », « Drhkat » vs « Direction des recettes du
Haut Katanga (DRHKAT) ») n'ont pas encore d'entrée correspondante dans
`ref_canoniques` et restent donc affichées comme des entités perceptrices
distinctes, conformément au principe ci-dessus (ne jamais fusionner une
variante non répertoriée). Pour les regrouper, ajoutez la paire
`libelle_brut` → `nom_canonique` correspondante dans `ref_canoniques`.

### Valeur source et valeur canonique affichées côte à côte

Un audit qualité (sept. 2026) demandait de ne pas se contenter de
normaliser les *filtres* : « il faut présenter deux colonnes clairement
séparées ». C'est fait des deux côtés :

- **Explorateur** : toute colonne couverte par `CANON_COLS` affiche, juste
  à droite de la colonne source (jamais modifiée), une colonne
  supplémentaire grisée « *(colonne)* canonique » avec la valeur normalisée
  — le nombre de colonnes canoniques ajoutées est indiqué dans le pied de
  tableau.
- **Géographie** (tableau « Paiements infranationaux détaillés ») : chaque
  colonne canonique (Province, Entité perceptrice, Entreprise, Flux)
  affichée dans le regroupement choisi est suivie d'une colonne « *(brute)*
  » qui liste le·s libellé·s original·aux réunis dans ce regroupement (par
  ex. « DRLU / Direction des recettes de Lualaba (DRLU) » quand les deux
  variantes existent pour la même ligne canonique).

Dans les deux cas, la colonne source/brute reste la référence de
traçabilité avec les annexes déclarées ; seule la colonne canonique sert de
base aux filtres et aux agrégations.

## Comment exploiter et faire évoluer ce code

Ce projet est volontairement structuré en couches simples, chacune
modifiable indépendamment. Voici comment aborder les évolutions les plus
courantes.

### Vue d'ensemble des fichiers

| Fichier | Rôle | À modifier pour... |
|---|---|---|
| `models.py` | Schéma de la base (SQLAlchemy) | ajouter un nouveau type de contenu persistant (ex. une nouvelle table métier) |
| `app.py` | Routes API + logique serveur (auth, fusion de contenu) | ajouter une nouvelle route API, changer les règles de sécurité |
| `import_data.py` | Import/ré-import des données depuis les fichiers `data/*.seed.*` ou un export HTML original | changer le format d'import, ajouter un nouveau champ à importer par défaut |
| `templates/index.html` | Squelette HTML (une seule page) : barre latérale, en-tête, modales | ajouter un nouveau bouton, une nouvelle modale, un nouvel élément statique |
| `static/app.js` | Tout le rendu et la logique côté navigateur (graphiques, carte, explorateur, admin) | ajouter une page/rubrique, un nouveau graphique, une nouvelle règle métier |
| `static/style.css` | Apparence (couleurs, mise en page, thème clair/sombre) | changer les couleurs, la mise en page, ajouter un style pour un nouvel élément |

### Ajouter une nouvelle rubrique (page) au menu

1. Dans `static/app.js`, écrivez une fonction `function mMaPage(){return '...';}`
   qui renvoie le HTML de la page (voir `mAbout` ou `mReports` comme modèles
   simples), et une fonction de dessin `function drawMaPage(){...}` si la
   page contient des graphiques (sinon `()=>{}` suffit).
2. Ajoutez une entrée dans `MODULES` : `mapage:{t:"Mon titre",f:mMaPage,d:drawMaPage}`.
3. Ajoutez l'entrée correspondante dans `NAV` (icône + libellé) pour qu'elle
   apparaisse dans le menu — elle bénéficiera automatiquement du masquage
   via « Gérer les rubriques ».

### Ajouter un nouveau texte éditable

Trois étapes, à l'image de ce qui existe déjà pour `about.*` ou `intros.*` :

1. Choisissez un chemin (ex. `"maSection.monTexte"`) et ajoutez sa valeur
   par défaut dans le bloc de défauts en haut de `static/app.js` (juste
   après `let C=RAW.content;`), pour que le champ existe même si la base
   n'a pas encore été republiée avec cette nouvelle clé.
2. Dans la fonction de rendu de la page concernée, affichez-le avec
   `<p data-edit="maSection.monTexte">${esc(C.maSection.monTexte)}</p>`.
   C'est tout : `markEditable()`/`collectEdits()` (déjà génériques) le
   rendent éditable et le sauvegardent automatiquement avec le reste du
   contenu au clic sur « Enregistrer & publier ».
3. (Optionnel) Documentez le nouveau champ dans `data/content.seed.json`
   pour qu'il soit présent dès le premier import sur une base neuve.

### Ajouter un nouveau jeu de données (table)

- Depuis l'admin (rapide, sans toucher au code) : utilisez **Enrichir les
  données** → sélectionnez une table existante comme gabarit ou appelez
  directement `PUT /api/datasets/<nouveau_nom>` avec `cols`/`types`/`rows`
  (voir l'exemple `curl` plus haut) : la table est créée si elle n'existe
  pas encore.
- Depuis l'import (pérenne, pour un import répété) : ajoutez la table dans
  `data/warehouse.seed.json` (ou dans un nouvel export HTML complet), puis
  relancez `python import_data.py [export.html]`.
- Pour qu'elle apparaisse dans l'Explorateur avec la bonne catégorie,
  utilisez `cat` = `"faits"`, `"contextuel"`, `"dimensions"` ou `"annexe"`
  (voir le regroupement dans `mExplorer()` côté `static/app.js`).

### Mises à jour de schéma (migrations légères)

Quand une nouvelle version du code ajoute une colonne à un modèle déjà
existant en production (ex. `AdminUser.role` ajouté en sept. 2026), une
base de données déjà peuplée ne la possède pas automatiquement : SQLite ne
modifie jamais une table existante tout seul, seul `db.create_all()` crée
les tables *manquantes*. Sans précaution, le nouveau code plante avec une
erreur `no such column`.

Pour éviter de revivre cet incident, `models.run_light_migrations()`
s'exécute automatiquement à **chaque démarrage** de l'application (appelé
depuis `create_app()`) : elle crée les tables manquantes, puis ajoute les
colonnes manquantes sur les tables déjà existantes, à partir de la liste
`_ADDED_COLUMNS` en haut de `models.py`. C'est idempotent (ne fait rien si
tout est déjà à jour) et sans danger à chaque redémarrage — y compris sur
Render, où le service redémarre à chaque déploiement.

Si vous ajoutez vous-même une colonne à un modèle existant, ajoutez une
entrée à `_ADDED_COLUMNS` dans `models.py` en même temps : le prochain
déploiement l'appliquera automatiquement, sans étape manuelle. (Ajouter une
toute nouvelle *table* ne nécessite rien de plus : `db.create_all()` s'en
charge seul.)

### Changer de base de données (SQLite → PostgreSQL/MySQL)

Aucune ligne de code à changer : `DATABASE_URL` dans `.env` pilote tout
(SQLAlchemy). Exemple pour PostgreSQL :

```
DATABASE_URL=postgresql+psycopg2://utilisateur:motdepasse@hote:5432/transparencerdc
```

Installez le pilote correspondant (`pip install psycopg2-binary`), puis
relancez `python import_data.py` sur la nouvelle base.

### Déboguer / inspecter la base directement

```bash
flask --app app shell
>>> from models import Dataset, SiteContent
>>> Dataset.query.get("fait_total_annuel").rows[:3]
>>> SiteContent.singleton().content["brand"]
```

### Style visuel

Toutes les couleurs de marque et de graphiques sont des variables CSS
définies dans `:root{...}` en haut de `static/style.css` (`--sky`, `--red`,
`--amber`, `--teal`, `--violet`, `--green`, `--blue`, `--yellow`), lues
dynamiquement par les fonctions de graphique JS (`css('--sky')`). Changer
une couleur là suffit à la répercuter partout (cartes, graphiques,
boutons). Le thème sombre a son propre bloc de variables juste en dessous
— à maintenir en cohérence si vous changez le thème clair.

### Sécurité — points à retenir avant une mise en production durable

- Changez `SECRET_KEY` et `ADMIN_PASSWORD` (déjà couvert plus haut).
- `PUT /api/datasets/<nom>` et `PUT /api/content` acceptent n'importe quel
  contenu JSON de la part d'un administrateur authentifié : ce sont des
  routes de confiance totale envers le compte admin, comme n'importe quel
  CMS. Ne partagez le mot de passe admin qu'avec des personnes de
  confiance.
- Il n'y a pas de limite de débit (rate limiting) sur `/api/login` par
  défaut : pour un site très exposé, envisagez `Flask-Limiter` pour
  limiter les tentatives de connexion.
