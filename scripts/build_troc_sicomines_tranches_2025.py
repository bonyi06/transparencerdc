#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Intègre le fichier « Données sicomines.xlsx » (3 feuilles, fourni directement
par l'utilisateur, 2026-09-24) dans TransparenceRDC, en réponse à la demande :
« Pour sicomines, dans la carte tous les projets avec tous leurs détails à
puiser dans chacune des trois feuilles de ce fichier excel ».

Les 3 feuilles :
  - Feuil1 (« Budget 2015-2018/2022/2024 x2/2025 ») : 83 projets répartis en
    5 tranches budgétaires, avec pour chacun le coût, les travaux exécutés
    (cumul 2022, cumul 2023, cumul à ce jour), les travaux restants, l'unité
    physique, les quantités prévue/réalisée et l'état d'avancement textuel
    (dates de démarrage/réception, statut des travaux). C'est la source la
    plus détaillée disponible sur le programme SICOMINES/APCSC : elle
    remplace la « Liste des infrastructures exécutées » (troc_sicomines_
    liste_executees, 48 lignes, 4 « Phases ») comme source de LA CARTE, sans
    que cette dernière ne soit supprimée — elle reste publiée telle quelle
    dans l'Explorateur, les deux documents ne se recouvrant pas totalement
    (voir meta.qualite du nouveau jeu de données ci-dessous).
  - Feuil2 : 77 projets + total, avec libellé, investissement cumulé et
    localisation — IDENTIQUE (mêmes 77 lignes, même total 1 208 871 210,7771
    USD) au jeu de données déjà publié troc_sicomines_annexe26_apcsc ; non
    réimportée ici pour éviter un doublon exact.
  - Feuil3 : 58 projets avec deux investissements cumulés rapportés en
    parallèle par l'ACGT (Agence Congolaise des Grands Travaux) et par
    l'APCSC (Agence pour la Promotion et la Coordination du Sino-Congolais),
    permettant de voir les écarts entre les deux agences de suivi — jusqu'ici
    absente du site, ajoutée ici comme troc_sicomines_reconciliation_acgt_apcsc.

Ce script :
  1) ajoute les deux nouveaux jeux de données ci-dessus à
     data/warehouse.seed.json (thème troc_sicomines) ;
  2) reconstruit la couche cartographique SICOMINES (clé "sicomines_infra"
     de data/geo.seed.json) à partir des 83 projets de Feuil1, chacun avec
     tous ses détails d'exécution dans les propriétés du point.

RÈGLE INTANGIBLE (ne rien cacher, jamais deviner) : aucune coordonnée n'est
inventée. Chaque point utilise une coordonnée de lieu réel et nommé, vérifiée
indépendamment (Wikipédia, latitude.to, geodatos.net — voir COORDS
ci-dessous, chaque entrée cite sa source). Quand la localisation déclarée
dans le fichier source ne correspond à aucun lieu vérifiable avec certitude
(ex. "Lumumba-Ville" déclaré en province du Tanganyika alors que le seul
lieu de ce nom identifié se trouve au Sankuru ; le port de Ndomba dont la
coordonnée précise n'a pas pu être vérifiée indépendamment ; les lignes sans
aucune localisation comme les frais de gestion du programme), le projet est
listé explicitement en "non_georeferences" plutôt que placé arbitrairement.
"""
from __future__ import annotations

import collections
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WAREHOUSE_PATH = BASE_DIR / "data" / "warehouse.seed.json"
GEO_PATH = BASE_DIR / "data" / "geo.seed.json"

SOURCE_NOTE = "« Données sicomines.xlsx » (3 feuilles), fourni directement par l'utilisateur (2026-09-24), au titre de l'Exigence ITIE 4.3 (fourniture d'infrastructures et accords de troc)"

# ---------------------------------------------------------------------------
# 1) Coordonnées vérifiées (lieux réels et nommés — jamais estimées)
# ---------------------------------------------------------------------------
COORDS = {
    # Déjà utilisées par scripts/build_troc_sicomines_map.py (v2/v3) :
    "kinshasa_gombe": (-4.30306, 15.30333, "Wikipédia (en) — commune de la Gombe, Kinshasa (infobox géographique)"),
    "kasomeno": (-10.75475, 28.28025, "mapcarta.com — localité de Kasomeno (Haut-Katanga)"),
    "kolwezi": (-10.717, 25.467, "Wikipédia (en) — Kolwezi (infobox géographique)"),
    "bukavu": (-2.50611, 28.86083, "Wikipédia (en) — Bukavu (infobox géographique)"),
    "butembo": (0.12778, 29.28750, "Wikipédia (en) — Butembo (infobox géographique)"),
    "manono": (-7.294704, 27.454491, "Wikipédia (en) — Manono, Democratic Republic of the Congo (infobox géographique)"),
    "kamina": (-8.73861, 24.99056, "Wikipédia (en) — Kamina (infobox géographique)"),
    "ankoro": (-6.75, 26.95, "Wikipédia (en) — Ankoro (infobox géographique)"),
    "kabongo": (-7.345, 25.58583, "Wikipédia (en) — Kabongo, Democratic Republic of the Congo (infobox géographique)"),
    "kisangani": (0.51667, 25.20000, "Wikipédia (en) — Kisangani (texte de l'article)"),
    "uvira": (-3.37000, 29.14000, "Wikipédia (en) — Uvira (infobox géographique)"),
    "kikwit": (-5.03861, 18.81806, "Wikipédia (en) — Kikwit (infobox géographique)"),
    "mbuji_mayi": (-6.150, 23.600, "Wikipédia (en) — Mbuji-Mayi (infobox géographique)"),
    "kalemie": (-5.91278, 29.19056, "Wikipédia (en) — Kalemie (infobox géographique)"),
    "goma": (-1.67944, 29.23361, "Wikipédia (en) — Goma (infobox géographique)"),
    "bunia": (1.567, 30.250, "Wikipédia (en) — Bunia (infobox géographique)"),
    "lomela": (-2.29028, 23.35417, "Wikipédia (en) — Lomela Airport, desservant le village de Lomela (Sankuru)"),
    # Nouvelles coordonnées vérifiées pour ce fichier (2026-09-24) :
    "kananga": (-5.90028, 22.46972, "Wikipédia (en) — Kananga (commune) (infobox géographique)"),
    "mbanza_ngungu": (-5.250, 14.867, "Wikipédia (en) — Mbanza-Ngungu (infobox géographique)"),
    "buta": (2.800, 24.733, "Wikipédia (en) — Buta, Democratic Republic of the Congo (infobox géographique)"),
    "isiro": (2.767, 27.617, "Wikipédia (en) — Isiro (infobox géographique) ; recoupé avec geodatos.net (2,77391 / 27,61603)"),
    "lusambo": (-4.9667, 23.4333, "latitude.to — Lusambo (Sankuru)"),
    "mbandaka": (0.0487, 18.2603, "latitude.to — Mbandaka"),
    "tshikapa": (-6.417, 20.800, "Wikipédia (en) — Tshikapa (infobox géographique)"),
    "lodja": (-3.5211, 23.6005, "latitude.to — Lodja (Sankuru)"),
    "kimpese": (-5.5500, 14.4333, "latitude.to — Kimpese (Kongo Central)"),
    "idiofa": (-4.97083, 19.58056, "Wikipédia (en) — Idiofa Airport, desservant la ville d'Idiofa (Kwilu)"),
    "matadi": (-5.8167, 13.4833, "latitude.to — Matadi (chef-lieu du Kongo Central)"),
    "lumumbaville": (-4.074750, 24.551472, "Wikipédia (en) — Lumumbaville, ville nouvelle en construction dans la province du Sankuru"),
}

# ---------------------------------------------------------------------------
# 2) Feuil1 — 83 projets, 5 tranches budgétaires, tous les champs d'exécution
#    Colonnes du fichier source : Ordre, Désignation, Localisation, Coût du
#    projet, Travaux exécutés cumul 2022, cumul 2023, cumul à ce jour,
#    Travaux restants, Unité, Quantité prévue, Quantité réalisée, État
#    d'avancement.
#    Champ ajouté ici : coord_key (clé vers COORDS, ou None -> non géoréférencé)
#    et, le cas échéant, une observation sur la localisation.
# ---------------------------------------------------------------------------
# p = (ordre, designation, localisation_source, cout, exec_2022, exec_2023, exec_cumul, restant, unite, qte_prevue, qte_realisee, etat_avancement, coord_key, obs_localisation)
TRANCHE_2015_2018 = [
    (1, "Asphaltage de la route Bukavu-Kamanyola (Phase 1)", "Sud-Kivu", 13000000, 13000000, 0, 13000000, 0, "Km", 5, 5, None, "bukavu", None),
    (2, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Lwambo-Mitwana-Manono", "Haut Katanga, Lualaba, Haut Lomami et Tanganyika", 30000000, 30000000, 0, 30000000, 0, "Km", 149.6, 149.6, None, "kalemie", "Localisation précisée sur 4 provinces dans le document source ; point placé à Kalemie (Tanganyika), à titre indicatif — ne représente pas le tracé réel de cet axe."),
    (3, "Contrat d'études et des travaux du projet de la modernisation de la traversée de Butembo", "Nord-Kivu", 11000000, 11000000, 0, 11000000, 0, "Km", 7.85, 7.85, None, "butembo", None),
    (4, "Projet d'accompagnement de la SICOMINES à Kolwezi", "Lualaba", 6000000, 6000000, 0, 6000000, 0, "Km", 4.66, 4.66, None, "kolwezi", None),
    (5, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Kilwit-Idiofa (70km)", "Kwilu", 10000000, 10000000, 0, 10000000, 0, "Km", 6.3, 6.3, None, "kikwit", "Point placé à Kikwit, une extrémité de l'axe vers Idiofa ; le tracé réel n'est pas représenté."),
    (6, "Contrat d'études et de travaux du projet de renforcement de la route revêtue Mbuji Mayi-Mwene Ditu", "Kasai Oriental, Lomami", 15000000, 15000000, 0, 15000000, 0, "Km", 16.22, 16.22, None, "mbuji_mayi", "Point placé à Mbuji-Mayi, une extrémité de l'axe vers Mwene-Ditu ; le tracé réel n'est pas représenté."),
    (7, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Kalemie (Phase I)", "Tanganyika", 15000000, 15000000, 0, 15000000, 0, "Km", 4.6, 4.6, None, "kalemie", None),
    (8, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Kalemie (Phase II)", "Tanganyika", 26871393.78, 26871393.78, 0, 26871393.78, 0, "Km", 7.57, 7.57, None, "kalemie", None),
    (9, "Contrat d'études et de travaux du projet de construction d'un nouveau stade à Kalemie", "Tanganyika", 16128606.22, 16128606.22, 0, 16128606.22, 0, "Places", 15000, 15000, None, "kalemie", None),
    (10, "Contrat d'études et de travaux de réhabilitation et modernisation de la route Bunagan-Rutshuru-Goma (100km)", "Nord-Kivu", 10000000, 10000000, 0, 10000000, 0, "Km", 11, 11, None, "goma", "Point placé à Goma, extrémité identifiée de l'axe."),
    (11, "Contrat d'études et de travaux du projet de stade de Goma", "Nord-Kivu", 10000000, 10000000, 0, 10000000, 0, "Places", 10000, 10000, None, "goma", None),
    (12, "Contrat d'études et de travaux du projet de stade de Bunia", "Ituri", 10000000, 10000000, 0, 10000000, 0, "Places", 10000, 10000, None, "bunia", None),
    (13, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Manono", "Tanganyika", 5000000, 5000000, 0, 5000000, 0, "Km", 3.84, 3.84, None, "manono", None),
    (14, "Contrat d'études et de travaux du projet de construction de l'unité de captage et de traitement de l'eau à Kamina dans la province du Katanga", "Haut Lomami", 10000000, 10000000, 0, 10000000, 0, "Production (m3)", 10000, 10000, None, "kamina", None),
    (15, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Kitanda-Ankoro (70km)", "Tanganyika", 5000000, 5000000, 0, 5000000, 0, "Km", 70, 70, None, "ankoro", "Point placé à Ankoro, extrémité identifiée de l'axe ; Kitanda n'a pas pu être vérifiée indépendamment."),
    (16, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Ankoro-Manono", "Tanganyika", 7500000, 7500000, 0, 7500000, 0, "Km", 115, 115, None, "ankoro", "Point placé à Ankoro, une extrémité de l'axe vers Manono."),
    (17, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Kamina-Kabongo", "Haut Lomami", 6000000, 6000000, 0, 6000000, 0, "Km", 230, 230, None, "kamina", "Point placé à Kamina, une extrémité de l'axe vers Kabongo."),
    (18, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Kabondo-Dienda-Mukwende", "Haut Lomami", 6000000, 6000000, 0, 6000000, 0, "Km", 350, 350, None, "kabongo", "Point placé à Kabongo, extrémité identifiée de l'axe."),
    (19, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Kisangani", "Tshopo", 15000000, 15000000, 0, 15000000, 0, "Km", 10.98, 10.98, None, "kisangani", None),
    (20, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Uvira (phase I)", "Sud-Kivu", 10000000, 10000000, 0, 10000000, 0, "Km", 2.3, 2.3, None, "uvira", None),
    (21, "Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Uvira (phase II)", "Sud-Kivu", 5000000, 5000000, 0, 5000000, 0, "Km", 2.3, 2.3, None, "uvira", None),
    (22, "Contrat d'études et de travaux du projet du stade de Bukavu (Phase I)", "Sud-Kivu", 10000000, 9266944.33, 0, 9433134.91, 566865.09, "Places", 10000, 10000, None, "bukavu", None),
    (23, "Contrat d'études et de fourniture et d'installation de poteaux solaires", "Tanganyika", 10000000, 10000000, 0, 10000000, 0, None, None, None, None, "kalemie", "Localisation précisée uniquement au niveau de la province (Tanganyika) ; point placé à Kalemie, chef-lieu, à titre indicatif."),
    (24, "Contrat d'études et de travaux de réhabilitation de l'avenue Nzolana (Phase I)", "Kinshasa", 15000000, 15000000, 0, 15000000, 0, "Km", 1.4, 1.4, None, "kinshasa_gombe", "Localisation donnée au niveau de la ville (Kinshasa) uniquement ; point indicatif."),
    (25, "Travaux de renforcement des boulevards triomphal et Sendwe à Kinshasa", "Kinshasa", 5000000, 5000000, 0, 5000000, 0, "Km", 3.67, 3.67, None, "kinshasa_gombe", "Point indicatif (ville de Kinshasa uniquement)."),
    (26, "Projet de construction de la bretelle reliant le boulevard Lumumba au stade de Kalemie", "Tanganyika", 5500000, 5500000, 0, 5500000, 0, "Km", 2.7, 2.7, None, "kalemie", None),
    (27, "Bitumage de 14km de la route entre Kanina-Musunoi-Kapata dans la ville de Kolwezi", "Lualaba", 9500000, 9500000, 0, 9500000, 0, "Km", 14, 14, None, "kolwezi", None),
    (28, "Projet de sondage et de découverte des zones d'exploitation artisanale dans la province de Lualaba", "Lualaba", 2500000, 1384644.65, 0, 1384644.65, 1115355.35, None, 0, 0, None, "kolwezi", "Localisation précisée uniquement au niveau de la province (Lualaba) ; point placé à Kolwezi, chef-lieu, à titre indicatif."),
    (29, "Projet de construction du pont LOMELA et ses composantes sociales d'accompagnement", "Sankuru", 5000000, 5000000, 0, 5000000, 0, "Mètres", 90, 90, None, "lomela", None),
]

TRANCHE_2022 = [
    (1, "Réhabilitation de l'Avenue Nzolana phase 2 et indemnisation des riverains", "Kinshasa", 25474411.96, 5624306.98, 23096289.97, 24836908.22, 637503.74, "Km", 7.12, 7.12, "Démarrage travaux : 21 octobre 2022 ; Réception provisoire : 21 mai 2024.", "kinshasa_gombe", None),
    (2, "Construction du stade de Bukavu phase 2", "Sud-Kivu", 3654086.98, 259028.26, 836007.07, 3083771.95, 570315.03, "Places", 10000, 10000, "Démarrage travaux (1ère phase) : décembre 2017 ; Reprise travaux (2e phase) : 21 août 2023 ; travaux en arrêt.", "bukavu", None),
    (3, "Construction d'un stade de 10 000 places à Katanga", "Kasai Oriental", 4000000, 0, None, 520000, 3480000, "Places", 10000, 0, "Signature contrat : 18 juillet 2024 ; travaux en cours.", "mbuji_mayi", "Écart entre la désignation (« à Katanga ») et la colonne Localisation du document (« Kasai Oriental »), reproduit tel quel ; point placé à Mbuji-Mayi, chef-lieu du Kasaï-Oriental."),
    (4, "Construction du stade de Bunia (voies d'accès + finalisation des travaux)", "Ituri", 3000000, 0, None, 1465317.77, 1534685.23, "Km", 2.7, 0, "Signature contrat : 18 juillet 2024 ; travaux en cours.", "bunia", None),
    (5, "Réhabilitation bâtiment 4 de l'ESP Bukavu", "Sud-Kivu", 417392.21, 0, None, 54260.99, 363131.22, None, 0, 0, "Signature contrat : 24 novembre 2023 ; travaux non démarrés.", "bukavu", None),
    (6, "Réhabilitation de l'université de Mbandaka et équipement", "Equateur", 2120000, 0, None, 275600, 1844400, None, 0, 0, "Signature contrat : 18 juillet 2024 ; travaux en cours.", "mbandaka", None),
    (7, "Fourniture et installation poteaux solaires Av. Kitutu", "Tanganyika", 787136, 0, None, 787136, 0, None, 0, 0, "Signature contrat : 24 novembre 2023 ; projet clôturé.", "kalemie", "Localisation précisée uniquement au niveau de la province (Tanganyika) ; point placé à Kalemie, chef-lieu."),
    (8, "Réhabilitation de l'aérodrome de Tshikapa (piste et aérogare) phase I", "Kasai", 3197566.26, 0, None, 415683.62, 2781882.64, None, 0, 0, "Signature contrat : 18 juillet 2024 ; travaux non démarrés.", "tshikapa", None),
    (9, "Usine de captage et de traitement d'eau potable de Kamina phase II", "Haut Lomami", 3901207.42, 0, None, 857828.8, 3043378.62, "Production (m3)", 10000, 10000, "Démarrage travaux : juillet 2024 ; travaux en cours.", "kamina", None),
    (10, "Réhabilitation route Kaniama-Kamina RN1", "Haut Lomami", 5352108.15, 0, None, 1995567.58, 3356540.57, "Km", 195, 0, "Démarrage travaux : août 2024 ; travaux en cours.", "kamina", "Point placé à Kamina, une extrémité de l'axe vers Kaniama."),
    (11, "Réhabilitation route Kamina-Luena RN1", "Haut Lomami", 4720833.85, 0, None, 2094181.21, 2626652.64, "Km", 172, 0, "Démarrage travaux : août 2024 ; travaux en cours.", "kamina", "Point placé à Kamina, une extrémité de l'axe vers Luena."),
    (12, "Réhabilitation de la RN20, tronçon allant du croisement de la RN1 et Idiofa phases 2 et 3", "Kwilu", 3510000, 0, 558004.58, 3453989.24, 56010.76, "Km", 2.23, 2.28, "Phase 2 : démarrage travaux 27 octobre 2023, réception définitive 7 juin 2025. Phase 3 : démarrage travaux 6 juillet 2024, réception provisoire 10 juin 2025.", "idiofa", None),
    (13, "Réhabilitation de la route Mbuji Mayi-Mwene Ditu phase 1 et 2", "Kasai oriental et Lomami", 23322145.43, 0, 9533928.44, 22015984.49, 1306160.94, "Km", 135, 0, "Démarrage travaux : 29 juin 2023 ; réception provisoire : 19 août 2025.", "mbuji_mayi", "Point placé à Mbuji-Mayi, une extrémité de l'axe vers Mwene-Ditu."),
    (14, "Réhabilitation de la route Bukavu-Nyangezi-Kamanyola phase 2", "Sud-Kivu", 31120435, 0, 8646239.26, 23222678.64, 7897756.36, "Km", 55, 20, "Démarrage travaux : 6 septembre 2023 ; travaux en arrêt.", "bukavu", None),
    (15, "Réhabilitation de la route Mwene Ditu-Kanyama phase 1", "Lomami et Haut Lomami", 7439782.5, 0, None, 6513255.97, 926526.53, "Km", 130, 0, "Démarrage travaux : 15 mars 2024 ; travaux en cours.", None, "Mwene-Ditu et Kanyama ne disposent pas de coordonnée vérifiée indépendamment dans le cadre de ce travail ; non représenté sur la carte plutôt que rapproché d'une autre ville de la province."),
    (16, "Réhabilitation RN25 Isiro-Poko et de la route Bafwasende-Bomili-Babeyro", "Haut-Uele", 7392558.85, 0, None, 961032.66, 6431526.19, "Km", 90, 0, "Signature contrat : 24 novembre 2023 ; travaux en cours.", "isiro", "Point placé à Isiro, extrémité identifiée de l'axe vers Poko ; Bafwasende, Bomili et Babeyro n'ont pas été vérifiés indépendamment."),
    (17, "Réhabilitation de la route Manterne-Tshela-Singingi", "Kongo Central", 7986113.74, 0, 1735864.83, 7756001.93, 230111.81, "Km", 118, 0, "Démarrage travaux : 15 juillet 2023 ; réception provisoire : 13 janvier 2025.", "matadi", "Localisation précisée uniquement au niveau de la province (Kongo Central) ; point placé à Matadi, chef-lieu, à titre indicatif — ne représente pas le tracé réel de cet axe."),
    (18, "Réhabilitation de la route Lusambo-Lac Mukamba", "Kasai central et Sankuru", 5162905, 0, None, 2065792.28, 3097112.72, "Km", 128, 0, "Signature contrat : 24 novembre 2023 ; travaux en cours.", "lusambo", "Point placé à Lusambo, une extrémité de l'axe vers le Lac Mukamba."),
    (19, "Réhabilitation et modernisation de l'hôpital général de Kikwit", "Sankuru", 3000000, 0, None, 2688344.07, 311655.93, None, 0, 0, "Démarrage travaux : 12 juin 2024 ; travaux en cours.", "kikwit", "Écart entre la désignation (« hôpital général de Kikwit », ville du Kwilu) et la colonne Localisation du document (« Sankuru »), reproduit tel quel ; point placé à Kikwit conformément à la désignation."),
    (20, "Modernisation de l'aérodrome de Lodja", "Sankuru", 2000000, 0, None, 727832.45, 1272167.55, None, 0, 0, "Signature contrat : 10 juin 2024 ; travaux en cours.", "lodja", None),
    (21, "Viabilisation de Lumumba-ville", "Tanganyika", 1500000, 0, None, 195000, 1305000, None, 0, 0, "Signature contrat : 10 juin 2024 ; travaux en cours.", None, "Le document source situe ce projet dans la province du Tanganyika ; or le seul lieu identifiable nommé « Lumumbaville » se trouve dans la province du Sankuru (voir la ligne « Viabilisation et aménagement de Lumumba-ville » de la tranche « Budget 2024, 300 M USD », où la province indiquée est cette fois Sankuru). Cette divergence entre les deux tranches du même document n'est pas arbitrée ; ce projet n'est donc pas placé sur la carte."),
    (22, "Travaux de réparation du Pont Lubuye (remboursement)", "Tanganyika", 941316.65, None, None, 941316.65, 0, None, 0, 0, "Projet clôturé.", "kalemie", "Localisation précisée uniquement au niveau de la province (Tanganyika) ; point placé à Kalemie, chef-lieu — ce pont dessert le boulevard Lumumba à Kalemie (voir le projet de bretelle correspondant, tranche 2015-2018)."),
]

TRANCHE_2024_324M = [
    (1, "Construction des rocades Sud-est et Sud-ouest de Kinshasa", "Rocade sud-ouest", 60000000, 0, None, 55245223.19, 4754776.81, "Km", 63, 0, "Démarrage travaux : août 2024 ; travaux en cours.", "kinshasa_gombe", "Point indicatif (ville de Kinshasa) ; ne représente pas le tracé réel des rocades."),
    (2, "Construction de la route Kananga-Kalamba Mbuji", "Kasai central", 40000000, 0, None, 29538029.62, 10461970.38, "Km", 230, 0, "Travaux en cours.", "kananga", None),
    (3, "Construction de la route Mbuji Mayi - Nguba", "Mbuji Mayi- Nguba", 130000000, 0, None, 121471574.07, 8528425.93, "Km", 853, 0, "Travaux en cours.", "mbuji_mayi", "Point placé à Mbuji-Mayi, une extrémité de l'axe vers Nguba."),
    (4, "Construction de la route Bukavu-Kamanyola phase 3", "Sud-Kivu", 20000000, 0, None, 4202187.41, 15797812.59, "Km", 55, 0, "Travaux en arrêt.", "bukavu", None),
    (5, "Construction de la route Kamanyola-Uvira", "Sud-Kivu", 20000000, 0, None, 0, 20000000, "Km", 74, 0, "Procédure de contractualisation en cours (signature contrat).", "uvira", "Point placé à Uvira, une extrémité de l'axe vers Kamanyola."),
    (6, "Construction de la route de la passion (Mbanza Ngungu-Nkamba, Kongo Centrale)", "Kongo Central", 19000000, 0, None, 0, 19000000, "Km", 51, 0, "Travaux en cours.", "mbanza_ngungu", "Point placé à Mbanza-Ngungu, une extrémité de l'axe vers Nkamba."),
    (7, "Construction de la route Manterne-Tshela-Singingi phase 2", "Kongo Central", 11000000, 0, None, 10443325.58, 556674.42, "Km", 118, 0, "Travaux en cours.", "matadi", "Localisation précisée uniquement au niveau de la province (Kongo Central) ; point placé à Matadi, chef-lieu, à titre indicatif."),
    (8, "Acquisition de satellite", None, 10000000, 0, None, 0, 10000000, None, 0, 0, None, None, "Aucune localisation physique déclarée dans le document source (acquisition d'équipement, non un chantier localisé)."),
    (9, "Frais de prestations sur consultant pour la réalisation des études hydrauliques de Kalemie et Uvira", None, 1500000, 0, None, 0, 1500000, None, 0, 0, None, None, "Contrat de prestations intellectuelles (études), sans chantier localisé déclaré dans le document source."),
    (10, "Frais de gestion du programme (APCSC)", None, 12500000, 0, None, 0, 12500000, None, 0, 0, None, None, "Frais de gestion administrative du programme, sans localisation physique."),
]

TRANCHE_2024_300M = [
    (1, "Construction de la route reliant le port de Ndomba au village de Bena Kazadi", "Kasai oriental", 30000000, 0, None, 8594066.34, 21405933.66, None, None, None, "Démarrage travaux 20 septembre 2025 ; travaux en cours.", None, "Le port de Ndomba est signalé par la presse congolaise (ACGT, Radio Okapi, mediacongo.net) comme situé près de Kabeya-Kamwanga (Kasaï-Oriental), mais aucune coordonnée de ce port ni du village de Bena Kazadi n'a pu être vérifiée avec un niveau de certitude suffisant pour ce travail ; non placé sur la carte plutôt qu'estimé."),
    (2, "Construction de la route Manterne-Tshela-Singini", "Kongo Central", 30000000, 0, None, 17453132.73, 12546867.27, None, None, None, "Travaux en cours.", "matadi", "Même convention que les autres lignes « Manterne-Tshela-Singingi » (Kongo Central, localisation province uniquement) ; point placé à Matadi, chef-lieu."),
    (3, "Construction de la route Buta-Isiro-Poko", "Haut uele", 30000000, 0, None, 6900000, 23100000, None, None, None, "Signature contrat : 24 novembre 2023 ; travaux en cours.", "buta", "Point placé à Buta, une extrémité de l'axe vers Isiro et Poko ; l'autre extrémité (Isiro) est également représentée par un point distinct au titre d'un autre projet de cette même tranche budgétaire."),
    (4, "Construction de la route Lac Munkamba-Lusambo", "Kasai central et Lusambo", 30000000, 0, None, 7493982.56, 22506017.44, None, None, None, "Travaux en cours.", "lusambo", None),
    (5, "Construction de la route Ingudi-Idiofa", "Kwilu", 25000000, 0, None, 13752664.94, 11247335.06, None, None, None, "Travaux en cours.", "idiofa", "Point placé à Idiofa, une extrémité de l'axe vers Ingudi."),
    (6, "Modernisation de l'hôpital général de Kikwit", "Kwilu", 10000000, 0, None, 2300000, 7700000, None, None, None, "Démarrage travaux : 12 juin 2025 ; travaux en cours.", "kikwit", None),
    (7, "Construction de l'université de Mbandaka et équipement", "Equateur", 18000000, 0, None, 4140000, 13860000, None, None, None, "Travaux en cours.", "mbandaka", None),
    (8, "Réhabilitation de l'aérodrome et l'aérogare de Tshikapa", "Kasai", 20000000, 0, None, 4600000, 15400000, None, None, None, "Signature contrat : 18 juillet 2024 ; travaux non démarrés.", "tshikapa", None),
    (9, "Construction de l'aérodrome de Lodja", "Sankuru", 10000000, 0, None, 2300000, 7700000, None, None, None, "Travaux en cours.", "lodja", None),
    (10, "Viabilisation et aménagement de Lumumba-ville", "Sankuru", 10000000, 0, None, 2300000, 7700000, None, None, None, "Travaux en cours.", "lumumbaville", "Cette ligne situe le projet en province du Sankuru, cohérent avec le lieu « Lumumbaville » identifié indépendamment (voir note sur la ligne homonyme de la tranche « Budget 2022 », qui le situait au Tanganyika)."),
    (11, "Construction du stade de Kananga", "Kasai central", 10000000, 0, None, 2300000, 7700000, None, None, None, "Travaux en cours.", "kananga", None),
    (12, "Construction d'un stade à Idiofa", "Kwilu", 10000000, 0, None, 3634980.085, 6365019.915, None, None, None, "Travaux en cours.", "idiofa", None),
    (13, "Solde pour acquisition d'un satellite", None, 20000000, 0, None, 0, 20000000, None, None, None, None, None, "Aucune localisation physique déclarée."),
    (14, "Infrastructures sociales dans la province du Kongo central : réfection écoles (Mbanza Boma et Kisantu) et hôpital de Kimpese", "Kongo Central", 5000000, 0, None, 1150000, 3850000, None, None, None, "Procédure de contractualisation en cours (signature contrat).", "kimpese", "Projet couvrant plusieurs sites (écoles de Mbanza Boma et Kisantu, hôpital de Kimpese) ; point placé à Kimpese, seul des trois sites explicitement nommé et vérifiable indépendamment."),
    (15, "Provision pour expropriation des riverains des rocades de Kinshasa", "Kinshasa", 17000000, 0, None, 9942760.71, 7057239.29, None, None, None, "Expropriations en cours.", "kinshasa_gombe", "Point indicatif (ville de Kinshasa)."),
    (16, "Études pour les projets à mettre en œuvre dans les prochaines tranches", None, 25000000, 0, None, 0, 25000000, None, None, None, None, None, "Aucune localisation physique déclarée (études préalables à de futurs projets)."),
]

TRANCHE_2025 = [
    (1, "Construction des Rocades Sud-est et Sud-ouest de Kinshasa", "Rocade sud-ouest", 80000000, None, None, 35196974.75, 44803025.25, "km", 63, None, "Démarrage travaux : août 2024 ; travaux en cours.", "kinshasa_gombe", "Tranche supplémentaire du même projet que dans « Budget 2024 (324 M USD) » ci-dessus ; point indicatif (ville de Kinshasa)."),
    (2, "Construction de la route Kananga-Kalamba Mbuji", "Kasai central", 45000000, None, None, 27034657.61, 17965342.39, "km", 230, None, "Démarrage travaux : 10 août 2024 ; travaux en cours.", "kananga", "Tranche supplémentaire du même projet que dans « Budget 2024 (324 M USD) » ci-dessus."),
    (3, "Construction de la route Mbuji Mayi - Nguba", None, 140000000, None, None, 32200000, 107800000, "Km", 853, None, "Travaux en cours.", "mbuji_mayi", "Tranche supplémentaire du même projet que dans « Budget 2024 (324 M USD) » ci-dessus."),
    (4, "Construction de la route Bukavu-Kamanyola phase 3", "Sud-Kivu", 24000000, None, None, 0, 24000000, "Km", 55, None, "Travaux en cours.", "bukavu", "Tranche supplémentaire du même projet que dans « Budget 2024 (324 M USD) » ci-dessus."),
    (5, "Construction de la route Manterne-Tshela-Singini Phase 2", "Kango Central", 20000000, None, None, 5150977.16, 14849022.84, "Km", 118, None, "Travaux en cours.", "matadi", "Localisation précisée uniquement au niveau de la province (Kongo Central) ; point placé à Matadi, chef-lieu."),
    (6, "Frais de gestion du programme (APCSC)", None, 15000000, None, None, 0, 15000000, "Km", None, None, None, None, "Frais de gestion administrative du programme, sans localisation physique. L'unité « Km » imprimée dans le document source pour cette ligne est manifestement une erreur de saisie du fichier ; reproduite telle quelle."),
]

TRANCHES = [
    ("Budget 2015-2018 (305 millions USD)", 305000000, TRANCHE_2015_2018),
    ("Budget 2022 (150 millions USD)", 150000000, TRANCHE_2022),
    ("Budget 2024 (324 millions USD)", 324000000, TRANCHE_2024_324M),
    ("Budget 2024 (Tranche de 300 millions USD)", 300000000, TRANCHE_2024_300M),
    ("Budget 2025 (Tranche de 324 millions USD)", 324000000, TRANCHE_2025),
]

# ---------------------------------------------------------------------------
# 3) Feuil3 — réconciliation ACGT / APCSC (58 projets)
# ---------------------------------------------------------------------------
RECONCILIATION = [
    ("Construction de la route Mbuji Mayi - Nguba", 153671574.07, 80155048.98),
    ("Construction de la route Kananga-Kalamba Mbuji", 56572687.23, 17550000),
    ("Réhabilitation de la route Manterne-Tshela-Singingi", 40803437.40, 16410804.97),
    ("Réhabilitation de la route Mbuji Mayi- Mwene Ditu phase 1 et 2", 37015984.49, 31916581.48),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Lwambo-Mitwana-Manono", 30000000, 30000000.00),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Kalemie (Phase II)", 26871393.78, 26871394.09),
    ("Contrat d'études et travaux du projet de réhabilitation de l'avenue Nzolana Phase 2", 24836908.22, 24605352.49),
    ("Contrat d'études et travaux du projet de réhabilitation de la route Bukavu-Nyangezi-Kamanyola", 23222678.64, 23222678.64),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Manono", 20000000, 20000000),
    ("Contrat d'études et de travaux du projet de construction d'un nouveau stade à Kalemie", 16128606.22, 16128606.22),
    ("Contrat d'études et de travaux de réhabilitation de l'avenue Nzolana (Phase I)", 15000000, 15000000),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Kisangani", 15000000, 15000000),
    ("Construction de la route Ingudi-Idiofa", 13752664.94, 5750000),
    ("Projet d'asphaltage de la route Bukavu-Kamanyola (Projet 2015)", 13000000, 13000000),
    ("Contrat d'études et des travaux du projet de la modernisation de la traversée de Butembo", 11000000, 11000000),
    ("Contrat d'études et de travaux de réhabilitation et modernisation de la route Bunagan-Rutshuru-Goma (100km)", 10000000, 10000000),
    ("Contrat d'études et de travaux du projet de stade de Bunia", 10000000, 10000000),
    ("Contrat d'études et de travaux du projet de stade de Goma", 10000000, 10000000),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Kilwit-Idiofa (70km)", 10000000, 10000000),
    ("Contrat d'études et de fourniture et d'installation de poteaux solaires", 10000000, 20106864.23),
    ("Contrat d'études et de travaux du projet de construction de l'unité de captage et de traitement de l'eau à Kamina dans la province du Katanga", 10000000, 9740014.49),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Uvira (phase I)", 10000000, 5000000),
    ("Projet de la Provision pour expropriation des riverains des Rocades de Kinshasa", 9942760.71, 5100000),
    ("Contrat d'études et travaux du projet de réhabilitation de la route Lusambo-Lac Mukamba", 9559774.84, 8226835.43),
    ("Projet de Bitumage de 14 Km de route entre Kanina-Musonoie-Kapata dans la ville de Kolwezi (Projet 2018)", 9500000, 9500000),
    ("Projet de construction d'un nouveau Stade de Bukavu (Projet 2015)", 9433134.91, 9433134.91),
    ("Projet de construction de la route reliant le port de Ndomba au Village de Bena-Kazadi", 8594066.34, 6900000),
    ("Projet de Réhabilitation et Modernisation de la Route Ankoro-Manono (115Km) (Projet 2015)", 7500000, 7500000),
    ("Construction de la route Buta - Poko - Isiro, Phase 2", 6900000, 6900000),
    ("Réhabilitation de la route Mwenne Ditu-Kanyama phase 1", 6513255.97, 10762614.68),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Kabondo-Dienda-Mukwende", 6000000, 6000000),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la route Kamina-Kabongo", 6000000, 6000000),
    ("Projet d'études et de travaux d'accompagnement de la SICOMINES Kolwezi (Réhabilitation et Modernisation de la Voirie de Kolwezi) (Projet 2015)", 6000000, 6000000),
    ("Contrat d'études et travaux du projet de la construction de route devant relier l'aérogare de Kalemie et le nouveau stade de Kalemie au Boulevard de Lumumba", 5500000, 5500000),
    ("Réhabilitation de l'aérodrome de Tshikapa (piste et aérogare), Phases 1 & 2", 5015683.62, 5015683.62),
    ("Contrat d'études et des travaux du projet de réhabilitation et de modernisation de la voirie de Uvira (phase II)", 5000000, 5000000),
    ("Projet de Construction du Pont Lomela (Projet 2018)", 5000000, 5000000.00),
    ("Travaux de renforcement des boulevards triomphal et Sendwe à Kinshasa", 5000000, 5000000),
    ("Projet de Réhabilitation et de Modernisation de la Route Kitanda-Ankoro (70Km) (Projet 2015)", 5000000, 5213008.16),
    ("Projet de Réhabilitation de l'Université de Mbandaka et Equipement Phases 1 & 2", 4415600, 4415600),
    ("Construction de la route Bukavu Kanyola, Phase 3", 4202187.41, 4202187.41),
    ("Projet de construction d'un Stade à Idiofa", 3634980.085, 2300000),
    ("Contrat d'études et travaux du projet de réhabilitation de la RN20, tronçon allant du croisement de la RN1 et Idiofa", 3453989.24, 3214285.31),
    ("Contrat d'études et travaux du Projet de construction du Stade Bukavu (Phase 2)", 3083771.95, 3083771.95),
    ("Projet de Modernisation de l'aérodrome de Lodja 1 & 2", 3027832.45, 2560000),
    ("Construction d'un Stade de 8000 places à Kananga, Phases 1 & 2", 2820000, 2820000),
    ("Projet de viabilisation de Lumumba-Ville, Phases 1 & 2", 2495000, 2495000),
    ("Modernisation de l'hôpital général de Kikwit", 4988344.07, 2690000),
    ("Contrat d'études et travaux du projet de réhabilitation de la route Kamina-Luena RN1", 2094181.21, 1501348.98),
    ("Contrat d'études et travaux du projet de réhabilitation de la route Kaniama-Kamina RN1", 1995567.58, 1995567.58),
    ("Projet de Construction du Stade de Bunia (les voies d'accès + finalisation des travaux)", 1465317.77, 390000),
    ("Travaux de sondage et découverture des Zones d'Exploitation Artisanale dans la Province du Lualaba (Projet 2018)", 1384644.65, 1384684.65),
    ("Projet d'infrastructures sociales dans la Province du Kongo Central : réfection écoles (Mbanza Boma et de Kisantu) et Hôpital de Kimpese", 1150000, 1150000),
    ("Projet de Réhabilitation de la route RN25 Isiro-Poko et de la route Bafwasende-Bomili-Babeyro", 961032.66, 961032.66),
    ("Projet de renforcement du Pont Lubuye du Projet de réhabilitation du Boulevard Lumumba à Kalemie", 941316.65, 941316.65),
    ("Contrat d'études et travaux de Projet de réhabilitation de l'Usine de Captage et de Traitement d'Eau à Kamina (Phase 2)", 857828.8, 857828.8),
    ("Projet de Fourniture et Installation des Poteaux Solaires Av. Kitutu", 787136, 787136),
    ("Projet de réhabilitation de Bâtiment 4 de l'ISP Bukavu", 54260.99, 54260.99),
]


def build_warehouse_datasets() -> dict:
    cols_t = ["Tranche budgétaire", "Ordre", "Désignation du projet", "Localisation (telle que déclarée)",
              "Coût du projet (USD)", "Travaux exécutés — cumul 2022 (USD)", "Travaux exécutés — cumul 2023 (USD)",
              "Travaux exécutés — cumul à ce jour (USD)", "Travaux restants (USD)", "Unité", "Quantité prévue",
              "Quantité réalisée", "État d'avancement du projet", "Observation sur la localisation"]
    types_t = ["str", "num", "str", "str", "num", "num", "num", "num", "num", "str", "num", "num", "str", "str"]
    rows_t = []
    for tranche_label, tranche_total, projets in TRANCHES:
        for (ordre, desig, loc, cout, ex22, ex23, cumul, restant, unite, qp, qr, etat, coord_key, obs) in projets:
            rows_t.append([tranche_label, ordre, desig, loc, cout, ex22, ex23, cumul, restant, unite, qp, qr, etat, obs])
        rows_t.append([tranche_label, "Total", None, None, tranche_total, None, None, None, None, None, None, None, None, None])

    ds_tranches = dict(
        label="SICOMINES/APCSC — projets par tranche budgétaire (2015-2025), détail complet",
        cat="Entrepôt consolidé 2015-2025",
        desc=(
            "Les 83 projets d'infrastructures du programme sino-congolais (SICOMINES/APCSC), tels que "
            "listés projet par projet dans le fichier « Données sicomines.xlsx » fourni par l'utilisateur, "
            "répartis en 5 tranches budgétaires (2015-2018, 2022, deux tranches 2024, 2025), avec pour "
            "chacun le coût, les travaux exécutés cumulés 2022/2023/à ce jour, les travaux restants, "
            "l'unité physique, les quantités prévue/réalisée et l'état d'avancement. C'est la source la "
            "plus détaillée disponible sur ce programme ; elle sert désormais de base à la carte des "
            "infrastructures SICOMINES."
        ),
        cols=cols_t, types=types_t, rows=rows_t,
        meta=dict(
            theme="troc_sicomines", theme_label="Fourniture d'infrastructures et accords de troc (SICOMINES)",
            periode="2015-2025", unite="USD, et quantités physiques (km/m²/places/m³ selon le projet)",
            devise="USD", source=SOURCE_NOTE,
            perimetre="Programme sino-congolais (Convention de Collaboration du 22/04/2008) et JV SICOMINES — projets d'infrastructures financés sur les tranches budgétaires 2015-2025 listées dans le document source",
            desagregation="tranche budgétaire, projet",
            qualite=(
                "Cette table recouvre en partie, sans lui être identique, le jeu de données "
                "troc_sicomines_liste_executees (48 lignes, 4 « Phases », document « Liste des "
                "infrastructures exécutées ») : plusieurs projets portent le même nom mais avec des "
                "montants différents selon le document et la tranche (ex. plusieurs tranches successives "
                "pour les rocades de Kinshasa ou pour Kananga-Kalamba Mbuji) — les deux sources sont "
                "publiées telles quelles, sans être fusionnées ou arbitrées. Deux incohérences internes au "
                "fichier source lui-même sont également reproduites sans correction : le projet « "
                "Viabilisation de Lumumba-ville » est situé au Tanganyika dans la tranche « Budget 2022 » "
                "puis au Sankuru dans la tranche « Budget 2024 (300 M USD) » (seul un lieu nommé "
                "« Lumumbaville », au Sankuru, a pu être identifié indépendamment) ; le projet « hôpital "
                "général de Kikwit » est situé au Sankuru dans le document alors que Kikwit se trouve au "
                "Kwilu. Les totaux de tranche imprimés dans le document (colonne 'Ordre'='Total') sont "
                "conservés tels quels, y compris quand ils ne se recoupent pas exactement avec la somme des "
                "lignes de projets (non recalculés ici)."
            ),
        ),
    )

    cols_r = ["Désignation du projet", "Investissement cumulé — ACGT (USD)", "Investissement cumulé — APCSC (USD)", "Écart ACGT − APCSC (USD)"]
    types_r = ["str", "num", "num", "num"]
    rows_r = [[d, acgt, apcsc, round(acgt - apcsc, 2)] for (d, acgt, apcsc) in RECONCILIATION]
    ds_reconciliation = dict(
        label="SICOMINES/APCSC — réconciliation des investissements cumulés déclarés par l'ACGT et par l'APCSC",
        cat="Entrepôt consolidé 2015-2025",
        desc=(
            "Pour 58 projets du programme SICOMINES/APCSC, comparaison des investissements cumulés "
            "déclarés en parallèle par l'ACGT (Agence Congolaise des Grands Travaux) et par l'APCSC "
            "(Agence pour la Promotion et la Coordination du Sino-Congolais). Les deux agences ne "
            "rapportent pas toujours le même montant pour un même projet ; l'écart est calculé mais "
            "jamais arbitré — les deux valeurs déclarées restent visibles telles quelles."
        ),
        cols=cols_r, types=types_r, rows=rows_r,
        meta=dict(
            theme="troc_sicomines", theme_label="Fourniture d'infrastructures et accords de troc (SICOMINES)",
            periode="2015-2025", unite="USD", devise="USD", source=SOURCE_NOTE,
            perimetre="58 projets du programme sino-congolais pour lesquels le document source rapporte à la fois un montant ACGT et un montant APCSC",
            desagregation="projet",
            qualite=(
                "Les écarts entre les deux colonnes vont d'un centime d'arrondi à plusieurs dizaines de "
                "millions d'USD (ex. « Construction de la route Mbuji Mayi - Nguba » : 153 671 574,07 USD "
                "ACGT contre 80 155 048,98 USD APCSC, soit un écart de plus de 73,5 millions d'USD). Cette "
                "table ne cherche pas à déterminer laquelle des deux agences est en tort : elle rend "
                "visible, projet par projet, l'ampleur du désaccord entre les deux sources de suivi "
                "budgétaire du programme, comme signalé par le Rapport de Validation ITIE-RDC sur la "
                "nécessité de systématiser le rapprochement des données financières de ce programme."
            ),
        ),
    )
    return {
        "troc_sicomines_tranches_budgetaires_2015_2025": ds_tranches,
        "troc_sicomines_reconciliation_acgt_apcsc": ds_reconciliation,
    }


def build_geo_features() -> tuple[list, list]:
    features = []
    non_geo = []
    pid = 0
    for tranche_label, _tranche_total, projets in TRANCHES:
        for (ordre, desig, loc, cout, ex22, ex23, cumul, restant, unite, qp, qr, etat, coord_key, obs) in projets:
            pid += 1
            props = dict(
                id=f"T{pid:02d}",
                tranche=tranche_label,
                ordre=ordre,
                designation=desig,
                localisation=loc,
                cout_usd=cout,
                exec_2022_usd=ex22,
                exec_2023_usd=ex23,
                exec_cumul_usd=cumul,
                restant_usd=restant,
                unite=unite,
                quantite_prevue=qp,
                quantite_realisee=qr,
                etat_avancement=etat,
                observation_localisation=obs,
                source_donnees=SOURCE_NOTE,
            )
            if coord_key:
                lat, lon, coord_source = COORDS[coord_key]
                props["source_coordonnees"] = coord_source
                props["qualite_geom"] = "province" if (obs and "chef-lieu" in obs) else ("indicatif" if (obs and "indicatif" in obs.lower() and "chef-lieu" not in obs) else "approx")
                features.append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}})
            else:
                non_geo.append(props)
    return features, non_geo


def main() -> None:
    warehouse = json.loads(WAREHOUSE_PATH.read_text(encoding="utf-8"))
    warehouse.setdefault("datasets", {})
    new_datasets = build_warehouse_datasets()
    for name, d in new_datasets.items():
        warehouse["datasets"][name] = d
    WAREHOUSE_PATH.write_text(json.dumps(warehouse, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"warehouse.seed.json : ajouté/mis à jour {list(new_datasets.keys())}")

    features, non_geo = build_geo_features()
    geo = json.loads(GEO_PATH.read_text(encoding="utf-8"))
    geo["sicomines_infra"] = collections.OrderedDict([
        ("type", "FeatureCollection"),
        ("name", "infrastructures_sicomines_tranches_2015_2025"),
        ("features", features),
        ("non_georeferences", non_geo),
        ("meta", collections.OrderedDict([
            ("periode", "2015-2025"),
            ("n_points_carte", len(features)),
            ("n_projets_tranches", sum(len(p) for _l, _t, p in TRANCHES)),
            ("n_non_georeferences", len(non_geo)),
            ("source", SOURCE_NOTE),
            ("n_projets_annexe26_apcsc", 77),
            ("montant_total_annexe26_usd", 1208871210.7771),
            ("note_couverture", (
                "[Note interne, mode administrateur] Carte reconstruite le 2026-09-24 à partir des 83 "
                "projets de la feuille « Feuil1 » du fichier « Données sicomines.xlsx » (5 tranches "
                "budgétaires 2015-2025), en remplacement de la précédente source cartographique "
                "(troc_sicomines_liste_executees, 48 lignes, 4 « Phases ») — cette dernière reste publiée "
                "intégralement dans l'Explorateur mais n'alimente plus la carte. Le détail complet "
                "d'exécution de chaque projet (coût, exécuté 2022/2023/cumul, restant, quantités, état "
                "d'avancement) est repris dans les propriétés de chaque point ET dans le jeu de données "
                "troc_sicomines_tranches_budgetaires_2015_2025 (Explorateur). La table de réconciliation "
                "ACGT/APCSC (troc_sicomines_reconciliation_acgt_apcsc) et la table Annexe 26/APCSC "
                "(troc_sicomines_annexe26_apcsc, inchangée) restent consultables séparément ci-dessous, "
                "sur la même page."
            )),
            ("note_coordonnees", (
                "Le document source ne publie que des noms de lieux (ville, commune ou province), jamais "
                "de coordonnées GPS. Chaque point utilise une coordonnée de lieu réel et nommé, vérifiée "
                "indépendamment (Wikipédia, latitude.to, geodatos.net — voir le champ « source_coordonnees » "
                "de chaque point). Sur les 83 projets, ceux dont la localisation ne cite qu'une province "
                "sont placés à son chef-lieu (qualite_geom=\"province\") ; ceux dont le nom de lieu ne peut "
                "être vérifié avec certitude, ou qui ne citent aucune localisation physique, sont listés "
                "explicitement dans « non_georeferences » plutôt que placés arbitrairement."
            )),
        ])),
    ])
    GEO_PATH.write_text(json.dumps(geo, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"geo.seed.json : sicomines_infra reconstruite — {len(features)} points, {len(non_geo)} non géoréférencés.")


if __name__ == "__main__":
    main()
