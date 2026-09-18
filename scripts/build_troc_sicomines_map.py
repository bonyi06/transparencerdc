#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construit la couche cartographique des infrastructures financées par le
programme sino-congolais / SICOMINES (2007-2025), à insérer dans
data/geo.seed.json sous la clé "sicomines_infra" (même emplacement que
"hydrocarbures", lu directement par GEO.sicomines_infra côté client — pas
de fichier séparé à fusionner, comme pour la couche Hydrocarbures).

SOURCE DES DONNÉES DESCRIPTIVES : dataset "troc_sicomines_projets" du
warehouse (data/warehouse.seed.json), lui-même construit par
scripts/build_troc_sicomines.py à partir de RFI_4.3_SICOMINES.xlsx.
Cette table recense 8 lignes de projets individuellement nommés (sur 43
projets financés au total d'après le bilan thématique SICOMINES 2008-2020 —
voir dataset "troc_sicomines_infrastructures" : les 35 autres n'existent que
sous forme de statistiques agrégées, sans nom ni localisation individuelle
dans les sources ITIE-RDC consultées).

SOURCE DES COORDONNÉES : l'Annexe C / les rapports ITIE-RDC ne publient
AUCUNE coordonnée GPS. Les 8 lignes ne donnent que des noms de lieux
(ville, territoire, tronçon routier). Conformément à la règle du projet
« ne jamais deviner une localisation », chaque point de cette couche est
positionné uniquement à l'aide de coordonnées de lieux réels, vérifiées
indépendamment via Wikipédia (infobox géographique) ou latitude.to
(répertoire de coordonnées de lieux nommés) — jamais inventées. Quand le
lieu exact d'une infrastructure ponctuelle (bâtiment) est identifiable
avec un nom propre (Palais du Peuple, Hôpital du Cinquantenaire), on
utilise la coordonnée de ce bâtiment précis. Quand la source ne nomme
qu'un axe routier entre deux localités, on utilise la coordonnée de la
localité la plus précisément identifiée (l'extrémité citée). Quand la
source ne nomme qu'un ensemble de rues/boulevards sans bâtiment de
référence (Boulevard du 30 juin et voiries associées), on utilise le
centre de la commune traversée (Gombe) comme point indicatif unique,
explicitement signalé comme tel — jamais une adresse ou un point précis
inventés sur ces voies. Un champ "qualite_geom" par entité distingue :
  - "approx"     : coordonnée d'un lieu/bâtiment nommément identifié dans
                   la source (ville, gare, bâtiment), vérifiée
                   indépendamment — bonne correspondance mais le point ne
                   représente pas nécessairement tout le tracé/l'emprise
                   réelle de l'infrastructure (ex. tronçon routier de
                   plusieurs dizaines de km réduit à son extrémité).
  - "indicatif"  : point de repère (ex. centre de commune) utilisé faute
                   de bâtiment ou lieu précis identifiable pour représenter
                   un ensemble de rues/avenues sur plusieurs kilomètres.
Rien n'est masqué : la ligne "Routes de l'Annexe C non exécutées en
entier" (portée nationale, plusieurs tronçons, aucune localisation unique
possible) est explicitement exclue de la carte et placée dans
"non_georeferences", à l'instar du bloc CC7 non cartographié de la couche
Hydrocarbures.

PHOTOS : uniquement des liens réels et vérifiés (Wikimedia Commons/Flickr)
vers des photographies correspondant sans ambiguïté au lieu concerné.
Laissés vides (avec mention explicite) pour les tronçons routiers (aucune
photo identifiable de l'ouvrage précis) et pour les stades (une
vérification a mis en évidence des confusions documentées entre photos de
stades de Goma/Bukavu dans plusieurs sources : par prudence, aucun lien
photo n'est proposé pour ces 5 stades plutôt que de risquer une
mauvaise attribution).
"""
import json, collections

GEO_PATH = "data/geo.seed.json"

# ---------------------------------------------------------------------
# Coordonnées vérifiées indépendamment (source indiquée pour chacune).
# ---------------------------------------------------------------------
COORDS = {
    "kasomeno":   (-10.75475, 28.28025, "mapcarta.com — localité de Kasomeno (Haut-Katanga)"),
    "kasenga":    (-10.35556, 28.61667, "Wikipédia (en) — Kasenga Airport, qui dessert la ville de Kasenga (Haut-Katanga)"),
    "nia_nia":    (1.40734, 27.60742, "mapcarta.com — localité de Nia Nia / Niania (Ituri), sur la RN4"),
    "hopital_cinquantenaire": (-4.341625, 15.296555, "Wikipédia (en) — L'hôpital du Cinquantenaire de Kinshasa (infobox géographique)"),
    "palais_peuple": (-4.3322, 15.3031, "latitude.to — Palais du Peuple (Kinshasa), répertoire de coordonnées de lieux nommés"),
    "gombe":      (-4.30306, 15.30333, "Wikipédia (en) — commune de la Gombe, Kinshasa (infobox géographique)"),
    "goma":       (-1.67944, 29.23361, "Wikipédia (en) — Goma (infobox géographique)"),
    "bukavu":     (-2.50611, 28.86083, "Wikipédia (en) — Bukavu (infobox géographique)"),
    "bunia":      (1.567, 30.250, "Wikipédia (en) — Bunia (infobox géographique)"),
    "kalemie":    (-5.91278, 29.19056, "Wikipédia (en) — Kalemie (infobox géographique)"),
}

def pt(key, id_, designation, lieu, entreprise, cout_usd, statut, eligible, note, source,
       qualite, distance_km=None, superficie_m2=None, photo_url=None, photo_credit=None):
    lat, lon, coord_source = COORDS[key]
    props = {
        "id": id_,
        "designation": designation,
        "lieu": lieu,
        "entreprise": entreprise or None,
        "cout_usd": cout_usd,
        "statut": statut,
        "eligible_annexe_c": eligible,
        "note": note or None,
        "source_donnees": source,
        "qualite_geom": qualite,
        "source_coordonnees": coord_source,
        "distance_km": distance_km,
        "superficie_m2": superficie_m2,
        "photo_url": photo_url,
        "photo_credit": photo_credit,
    }
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }

def main():
    with open(GEO_PATH, encoding="utf-8") as f:
        geo = json.load(f, object_pairs_hook=collections.OrderedDict)

    features = [
        pt("kasomeno", "RN5_LSHI_KASOMENO",
           "Terrassement et bitumage RN5 Lubumbashi–Kasomeno (137 km)",
           "Haut-Katanga — axe Lubumbashi–Kasomeno", "CREC 7",
           162283871.42, "Réception définitive 17/12/2016", "ND (non précisé dans la source)",
           "Point placé à l'extrémité Kasomeno de l'axe : le tracé réel des 137 km bitumés n'est pas représenté (aucune géométrie de route publiée par les sources ITIE-RDC).",
           "Rapport ITIE-RDC 2020-2021, tableau 24", "approx", distance_km=137),
        pt("kasenga", "RN5_KASOMENO_KASENGA",
           "RN5 Lubumbashi–Kasomeno / Kasomeno–Kasenga (ligne budgétaire complémentaire)",
           "Haut-Katanga — prolongement vers Kasenga", None,
           69073565.06, "Achevé (cumul encouru = budget)", "ND (non précisé dans la source)",
           "Ligne budgétaire distincte de celle de l'axe Lubumbashi–Kasomeno, rattachée au même corridor routier ; placée à Kasenga faute de tracé publié.",
           "Rapport ITIE-RDC 2020-2021, tableau 26", "approx"),
        pt("nia_nia", "RN4_BENI_NIANIA",
           "Bitumage RN4 Beni–Niania (60 km réalisés sur 410 km prévus à l'Annexe C)",
           "Nord-Kivu / Ituri — axe Beni–Niania", "SINOHYDRO 14",
           57768563.94, "Réception définitive 11/11/2011", "Oui",
           "Seuls 60 km sur les 410 km prévus à l'Annexe C ont été réalisés ; le solde (350 km) figure dans la liste des routes non exécutées en entier (voir « non géoréférencées » ci-dessous).",
           "Rapport ITIE-RDC 2020-2021, tableau 24 ; Rapport thématique SICOMINES §19", "approx", distance_km=60),
        pt("hopital_cinquantenaire", "HOPITAL_CINQUANTENAIRE",
           "Hôpital du Cinquantenaire (500 lits)", "Kinshasa (Mont Ngafula)", "SINOHYDRO 2",
           114879516.42, "Réception définitive 27/08/2014",
           "ND (non précisé dans la source)",
           "Deux montants distincts figurent dans les sources ITIE-RDC pour ce même projet : 114 879 516,42 USD (tableau 24, coût du contrat) et 114 901 200 USD (tableau 26, budget) — écart non arbitré, reproduit tel quel.",
           "Rapport ITIE-RDC 2020-2021, tableaux 24 et 26", "approx",
           photo_url="https://www.flickr.com/photos/rdcbenelux/5549662665",
           photo_credit="Flickr — Ambassade de la RDC (compte officiel), « L'hôpital du Cinquantenaire à Kinshasa »"),
        pt("palais_peuple", "ESPLANADE_PALAIS_PEUPLE",
           "Esplanade du Palais du Peuple (24 300 m²)", "Kinshasa (Lingwala)", "SINOHYDRO 2",
           24255299.12, "Réceptionné en 2011", "Non",
           "Le rapport thématique ITIE-RDC juge l'urgence de ce projet injustifiée.",
           "Rapport ITIE-RDC 2020-2021 ; Rapport thématique SICOMINES §19", "approx", superficie_m2=24300,
           photo_url="https://commons.wikimedia.org/wiki/Category:Palais_du_Peuple_(Kinshasa)",
           photo_credit="Wikimedia Commons — Category:Palais du Peuple (Kinshasa)"),
        pt("gombe", "BLVD_30_JUIN",
           "Boulevard du 30 juin (lots 1 et 2), boulevards Sendwe et Triomphal, avenue Tourisme, route Lutendele",
           "Kinshasa (Gombe et communes voisines)", "CREC 7 / CREC 8",
           None, "Réceptionnés entre 2011 et 2014", "ND (non précisé dans la source)",
           "Montant non individualisé dans la source pour cet ensemble de voiries. Un seul point (centre de la commune de la Gombe) représente ici plusieurs rues et boulevards distincts sur plusieurs kilomètres : position indicative, pas un tracé réel.",
           "Rapport ITIE-RDC 2020-2021, tableau 24", "indicatif",
           photo_url="https://commons.wikimedia.org/wiki/File:Boulevard_du_30_juin,_Kinshasa.jpg",
           photo_credit="Wikimedia Commons — File:Boulevard du 30 juin, Kinshasa.jpg"),
        pt("goma", "STADE_GOMA",
           "Stade de Goma", "Goma (Nord-Kivu)", None,
           None, "En cours/achevé (coût unitaire déclaré : 9,3 à 10 M USD)", "Non",
           "Fait partie d'un ensemble de 5 stades (Goma, Bunia, Bukavu, Kalemie ×2) déclaré pour un coût unitaire de 9,3 à 10 M USD chacun, sans détail individualisé par ville dans la source. Aucune photo vérifiée avec certitude n'est proposée ici : une confusion documentée existe entre des photographies de stades de Goma et de Bukavu dans plusieurs sources externes.",
           "Rapport ITIE-RDC 2020-2021, tableau 26 ; Rapport thématique SICOMINES §20", "approx"),
        pt("bunia", "STADE_BUNIA",
           "Stade de Bunia", "Bunia (Ituri)", None,
           None, "En cours/achevé (coût unitaire déclaré : 9,3 à 10 M USD)", "Non",
           "Fait partie du même ensemble de 5 stades que ci-dessus (voir Goma). Aucune photo vérifiée proposée pour la même raison de prudence.",
           "Rapport ITIE-RDC 2020-2021, tableau 26 ; Rapport thématique SICOMINES §20", "approx"),
        pt("bukavu", "STADE_BUKAVU",
           "Stade de Bukavu", "Bukavu (Sud-Kivu)", None,
           None, "En cours/achevé (coût unitaire déclaré : 9,3 à 10 M USD)", "Non",
           "Fait partie du même ensemble de 5 stades que ci-dessus (voir Goma). Aucune photo vérifiée proposée pour la même raison de prudence.",
           "Rapport ITIE-RDC 2020-2021, tableau 26 ; Rapport thématique SICOMINES §20", "approx"),
        pt("kalemie", "STADE_KALEMIE_X2",
           "Stades de Kalemie (2 stades)", "Kalemie (Tanganyika)", None,
           None, "En cours/achevés (coût unitaire déclaré : 9,3 à 10 M USD chacun)", "Non",
           "La source dénombre 2 stades à Kalemie (sur les 5 de l'ensemble Goma/Bunia/Bukavu/Kalemie×2), sans les distinguer par un nom ou un emplacement séparé : un seul point les représente tous les deux. Aucune photo vérifiée proposée pour la même raison de prudence qu'à Goma/Bukavu.",
           "Rapport ITIE-RDC 2020-2021, tableau 26 ; Rapport thématique SICOMINES §20", "approx"),
    ]

    non_geo = [{
        "id": "ANNEXE_C_ROUTES_NON_EXECUTEES",
        "designation": "Routes de l'Annexe C non exécutées en entier",
        "lieu": "National (Beni–Niania 410 km ; Mbujimayi–Mweneditu 135 km ; Bukavu–Kamanyola 55 km ; Bunagana–Rutshuru–Goma 100 km)",
        "statut": "Partiellement exécutées, objectif de désenclavement non atteint",
        "eligible_annexe_c": "Oui",
        "note": "Portée nationale sur 4 tronçons distincts dans 4 provinces différentes : aucune coordonnée unique ne peut représenter honnêtement cette ligne, qui n'est donc pas placée sur la carte (le tronçon Beni–Niania partiellement réalisé, lui, figure sur la carte — voir RN4 Beni–Niania).",
        "source": "Rapport thématique SICOMINES §19",
    }]

    geo["sicomines_infra"] = collections.OrderedDict([
        ("type", "FeatureCollection"),
        ("name", "infrastructures_sicomines_2007_2025"),
        ("features", features),
        ("non_georeferences", non_geo),
        ("meta", collections.OrderedDict([
            ("periode", "2007–2025"),
            ("n_projets_individuellement_documentes", len(features)),
            ("n_projets_total_bilan_thematique", 43),
            ("note_couverture", "Le bilan thématique SICOMINES (déc. 2021) recense 43 projets d'infrastructures financés entre 2008 et 2020 pour 814 671 507,49 USD engagés au total (voir dataset « Fourniture d'infrastructures et accords de troc — Bilan et indicateurs clés »). Seuls 8 projets sont individuellement nommés dans les sources ITIE-RDC consultées (dataset « …— Projets individuellement documentés ») : 7 d'entre eux sont représentés ci-dessous par 10 points (la ligne « stades » regroupant 5 stades dans 4 villes est ventilée en 4 points, un par ville) ; le 8ᵉ (routes de l'Annexe C non exécutées en entier, de portée nationale) figure en « non géoréférencé » faute de localisation unique possible. Les 35 autres projets du bilan thématique n'existent que sous forme de statistiques agrégées (nombre, coût, éligibilité Annexe C), sans identification individuelle — ils ne sont donc pas représentés sur cette carte, conformément à la règle de ne jamais deviner une localisation."),
            ("note_coordonnees", "Aucune coordonnée GPS n'est publiée par les sources ITIE-RDC pour ces projets (seuls des noms de lieux le sont). Les coordonnées de cette couche proviennent de vérifications indépendantes (Wikipédia, latitude.to) de lieux réels et nommés correspondant à chaque projet — jamais d'estimation ou d'invention. Le champ « source_coordonnees » de chaque point précise la référence utilisée."),
            ("sources", collections.OrderedDict([
                ("R2020_2021", "Rapport ITIE-RDC 2020-2021 (tableaux 24 et 26)"),
                ("THEM2021", "Rapport thématique ITIE-RDC « Exigence 4.3 : fourniture d'infrastructures et accords de troc — Programme sino-congolais/SICOMINES » (déc. 2021)"),
            ])),
        ])),
    ])

    with open(GEO_PATH, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, indent=1)

    print(f"OK — {len(features)} points ajoutés, {len(non_geo)} entité(s) non géoréférencée(s).")

if __name__ == "__main__":
    main()
