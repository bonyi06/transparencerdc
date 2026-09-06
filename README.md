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

Toutes les routes de données sont en JSON.

| Méthode | Route                              | Description                                                   | Auth requise |
|---------|-------------------------------------|-----------------------------------------------------------------|:---:|
| GET     | `/api/warehouse`                   | Entrepôt complet (tous les jeux de données + agrégats globaux) | non |
| GET     | `/api/datasets`                    | Métadonnées de tous les jeux de données (sans les lignes)       | non |
| GET     | `/api/datasets/<nom>`              | Un jeu de données complet (colonnes, types, lignes)             | non |
| PUT     | `/api/datasets/<nom>`              | Créer / remplacer un jeu de données                             | oui |
| DELETE  | `/api/datasets/<nom>`              | Supprimer un jeu de données                                     | oui |
| PATCH   | `/api/datasets/<nom>/visibility`   | Afficher/masquer une table pour le public `{visible}`            | oui (rôle admin) |
| GET     | `/api/content`                     | Textes du site + liste des rapports                             | non |
| PUT     | `/api/content`                     | Enregistrer & publier les textes (fusion, historisé)            | oui |
| GET     | `/api/content/history`             | Les 20 dernières publications                                   | oui |
| POST    | `/api/content/history/<id>/restore`| Revenir à une version précédente                                | oui |
| GET     | `/api/geo`                         | Objet géographique complet (carte des provinces)                | non |
| POST    | `/api/login`                       | `{username, password}` -> session admin                        | non |
| POST    | `/api/logout`                      | Termine la session admin                                        | non |
| GET     | `/api/me`                          | Session admin active ou non (+ rôle)                            | non |
| GET     | `/api/users`                       | Liste des comptes admin                                          | oui (rôle admin) |
| POST    | `/api/users`                       | Créer un compte `{username, password, role}`                    | oui (rôle admin) |
| PUT     | `/api/users/<id>`                  | Modifier rôle/activation/mot de passe d'un compte                | oui (rôle admin) |
| DELETE  | `/api/users/<id>`                  | Supprimer un compte                                              | oui (rôle admin) |
| GET     | `/api/audit-log`                   | Journal d'audit (200 dernières entrées)                          | oui |
| GET     | `/healthz`                         | Sonde de santé (pour load balancer / supervision)                | non |

`/gestion-admin` (chemin configurable via `ADMIN_ENTRY_PATH`) sert la même
page que `/` mais avec le bouton **⚙ Admin** visible — c'est le seul moyen
d'atteindre l'écran de connexion (voir § « Espace administrateur »).

Exemple : mettre à jour un jeu de données précis sans toucher aux autres
(pratique pour un script de mise à jour automatisé, un cron, etc.) :

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
