#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construit la couche cartographique des infrastructures financées par le
programme sino-congolais / SICOMINES (2007-2025), insérée dans
data/geo.seed.json sous la clé "sicomines_infra" (même emplacement que
"hydrocarbures" : lue directement par GEO.sicomines_infra côté client, pas
de fichier séparé à fusionner).

VERSION 2 — reconstruite pour utiliser STRICTEMENT les 42 projets du
dataset "troc_sicomines_liste_executees" (lui-même transcrit tel quel du
document « Liste des infrastructures exécutées » fourni directement par
l'utilisateur — voir scripts/build_troc_sicomines_annexe26.py), et non plus
l'ancienne synthèse à 8 lignes tirée de RFI_4.3_SICOMINES.xlsx (toujours
publiée telle quelle dans troc_sicomines_projets, mais qui n'est plus la
source de cette carte).

VERSION 3 (2026-09-21, demande explicite de l'utilisateur) — exhaustivité :
les 42 projets sont désormais TOUS représentés sur la carte, chacun dans sa
province déclarée. Les 3 projets qui ne citent qu'une province (sans ville)
dans la colonne « Localisation » du document source sont positionnés au
chef-lieu de cette province plutôt qu'exclus (qualite_geom="province") ;
ce n'est pas une localisation devinée — la province elle-même est la
donnée déclarée par la source, seul le point exact au sein de cette
province est une convention cartographique, explicitement signalée comme
telle dans les métadonnées (visibles en mode administrateur).

SOURCE DES COORDONNÉES : le document source ne donne que des noms de lieux
(ville/commune ou province), jamais de coordonnées GPS. Chaque point est
positionné à l'aide de coordonnées de lieux réels et nommés, vérifiées
indépendamment (Wikipédia, latitude.to, mapcarta) — jamais devinées ni
estimées. Quand un projet cite un axe entre deux localités (ex.
« Kamina-Kabongo »), le point est placé sur l'extrémité la mieux
identifiée. Quand un projet ne cite qu'une province (sans ville), le point
est placé au chef-lieu de cette province (qualite_geom="province").
"""
import json, collections

GEO_PATH = "data/geo.seed.json"

COORDS = {
    "kinshasa_gombe": (-4.30306, 15.30333, "Wikipédia (en) — commune de la Gombe, Kinshasa (infobox géographique)"),
    "palais_peuple": (-4.3322, 15.3031, "latitude.to — Palais du Peuple (Kinshasa)"),
    "hopital_cinquantenaire": (-4.341625, 15.296555, "Wikipédia (en) — L'hôpital du Cinquantenaire de Kinshasa (infobox géographique)"),
    "kasomeno": (-10.75475, 28.28025, "mapcarta.com — localité de Kasomeno (Haut-Katanga)"),
    "nia_nia": (1.40734, 27.60742, "mapcarta.com — localité de Nia Nia / Niania (Ituri), sur la RN4"),
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
}


def pt(id_, key, designation, lieu_source, quantite, cout_usd, phase, note, qualite="approx", photo_url=None, photo_credit=None):
    lat, lon, coord_source = COORDS[key]
    props = {
        "id": id_,
        "designation": designation,
        "lieu": lieu_source,
        "quantite": quantite,
        "cout_usd": cout_usd,
        "phase": phase,
        "note": note or None,
        "source_donnees": "Liste des infrastructures exécutées (document fourni par l'utilisateur), dataset troc_sicomines_liste_executees",
        "qualite_geom": qualite,
        "source_coordonnees": coord_source,
        "photo_url": photo_url,
        "photo_credit": photo_credit,
    }
    return {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}


def main():
    with open(GEO_PATH, encoding="utf-8") as f:
        geo = json.load(f, object_pairs_hook=collections.OrderedDict)

    features = [
        pt("P01", "kinshasa_gombe", "Route Lutundele", "Kinshasa", "4,5 Km", 21007915.30, "Phase 1",
           "Localisation donnée au niveau de la ville (Kinshasa) uniquement ; point indicatif au centre de la commune de la Gombe, pas l'emplacement réel de cette avenue.", qualite="indicatif"),
        pt("P02", "kinshasa_gombe", "Avenue du Tourisme", "Kinshasa", "6,8 Km", 29344191.97, "Phase 1",
           "Localisation donnée au niveau de la ville (Kinshasa) uniquement ; point indicatif, pas l'emplacement réel de cette avenue.", qualite="indicatif"),
        pt("P03", "kasomeno", "Bitumage de la RN5 Lubumbashi-Kasomeno", "Haut-Katanga", "137 Km", 93210305.71, "Phase 1",
           "Point placé à l'extrémité Kasomeno de l'axe Lubumbashi-Kasomeno ; le tracé réel des 137 km n'est pas représenté."),
        pt("P04", "kasomeno", "Terrassement de la RN5 Lubumbashi-Kasomeno", "Haut-Katanga", "137 Km", 69073563.80, "Phase 1",
           "Point placé à l'extrémité Kasomeno de l'axe Lubumbashi-Kasomeno (travaux de terrassement) ; le tracé réel des 137 km n'est pas représenté."),
        pt("P05", "nia_nia", "Bitumage RN4 Beni-Niania", "Nord-Kivu", "60 Km", 57782941.03, "Phase 1",
           "Point placé à Nia Nia (Niania), extrémité de l'axe Beni-Niania ; le tracé réel des 60 km n'est pas représenté."),
        pt("P06", "kinshasa_gombe", "Construction et achèvement de l'Hôpital centre-ville (Hôpital du Centenaire)", "Kinshasa", "4 500 m²", 114901200.00, "Phase 1",
           "Selon le document ITIE-RDC « Projets individuellement documentés » (Exigence 4.3), cet hôpital est nommé « Hôpital du Cinquantenaire » (montant très proche : 114 879 516,42 USD) — écart de dénomination entre sources, reproduit tel quel plutôt qu'arbitré. Point placé aux coordonnées vérifiées de l'Hôpital du Cinquantenaire de Kinshasa."),
        pt("P06b", "hopital_cinquantenaire", "Construction et achèvement de l'Hôpital centre-ville — coordonnée du bâtiment identifié (Hôpital du Cinquantenaire)", "Kinshasa (Mont Ngafula)", "4 500 m²", None, "Phase 1",
           "Second point de repère : coordonnées exactes du bâtiment de l'Hôpital du Cinquantenaire (probablement le même ouvrage que « Hôpital du Centenaire » ci-dessus — voir note), issues de Wikipédia. N'ajoute pas de montant supplémentaire (déjà compté au point P06).",
           photo_url="https://www.flickr.com/photos/rdcbenelux/5549662665",
           photo_credit="Flickr — Ambassade de la RDC (compte officiel), « L'hôpital du Cinquantenaire à Kinshasa »"),
        pt("P07", "kinshasa_gombe", "Modernisation du Boulevard du 30 juin lot 1", "Kinshasa", "5,38 Km", 25973618.36, "Phase 2",
           "Point indicatif (centre de la commune de la Gombe) : ne représente pas le tracé réel de ce boulevard sur plusieurs km.", qualite="indicatif",
           photo_url="https://commons.wikimedia.org/wiki/File:Boulevard_du_30_juin,_Kinshasa.jpg",
           photo_credit="Wikimedia Commons — File:Boulevard du 30 juin, Kinshasa.jpg"),
        pt("P08", "kinshasa_gombe", "Modernisation du Boulevard du 30 juin lot 2", "Kinshasa", "2,5 Km", 19341204.19, "Phase 2",
           "Point indicatif (centre de la commune de la Gombe) : ne représente pas le tracé réel de ce boulevard.", qualite="indicatif"),
        pt("P09", "kinshasa_gombe", "Modernisation du Boulevard Sendwe et Triomphal", "Kinshasa", "3,67 Km", 35894638.24, "Phase 2",
           "Point indicatif (centre de la commune de la Gombe) : ne représente pas le tracé réel de ces boulevards.", qualite="indicatif"),
        pt("P10", "palais_peuple", "Aménagement et construction de l'Esplanade du Palais du Peuple", "Kinshasa", "40 500 m²", 24255229.10, "Phase 2",
           "Superficie de l'esplanade selon ce document (40 500 m²) supérieure à celle du document « Projets individuellement documentés » (24 300 m²) — écart entre sources, reproduit tel quel plutôt qu'arbitré.",
           photo_url="https://commons.wikimedia.org/wiki/Category:Palais_du_Peuple_(Kinshasa)",
           photo_credit="Wikimedia Commons — Category:Palais du Peuple (Kinshasa)"),
        pt("P11", "kisangani", "Fournitures des Groupes électrogènes", "Kisangani", "19", 5667740.00, "Phase 2", None),
        pt("P12", "kisangani", "Installation d'une unité des préfabriqués", "Kisangani", "1", 7492260.00, "Phase 2", None),
        pt("P14", "bukavu", "Modernisation de la RN5 Bukavu-Kamanyola", "Sud-Kivu", "5 Km", 13000000.00, "Phase 3",
           "Point placé à Bukavu, extrémité identifiée de l'axe ; Kamanyola (l'autre extrémité) n'a pas été vérifié indépendamment."),
        pt("P15", "butembo", "Traversée de Butembo", "Nord-Kivu", "8 Km", 11000000.00, "Phase 3", None),
        pt("P16", "kolwezi", "Réhabilitation et modernisation de la voirie de Kolwezi (actions sociales Quartier Harmonie)", "Lualaba", "4,657 Km", 6000000.00, "Phase 3", None),
        pt("P17", "goma", "Réhabilitation de la voirie Bunagana-Rutshuru-Goma", "Nord-Kivu", "15 Km", 10000000.00, "Phase 3",
           "Point placé à Goma, extrémité identifiée de l'axe ; Bunagana et Rutshuru n'ont pas été vérifiés indépendamment."),
        pt("P18", "uvira", "Modernisation de la voirie d'Uvira (Phase 1)", "Sud-Kivu", "2,64 Km", 5000000.00, "Phase 3", None),
        pt("P19", "uvira", "Modernisation de la voirie d'Uvira (Phase 2)", "Sud-Kivu", "5,5 Km", 5000000.00, "Phase 3", None),
        pt("P21", "kinshasa_gombe", "Modernisation de l'avenue Nzolana (Phase 1)", "Kinshasa", "1,4 Km", 15000000.00, "Phase 3",
           "Point indicatif (centre de la commune de la Gombe) : ne représente pas l'emplacement réel de cette avenue.", qualite="indicatif"),
        pt("P22", "kinshasa_gombe", "Renforcement des Boulevards Sendwe et Triomphal", "Kinshasa", "3,67 Km", 5000000.00, "Phase 3",
           "Point indicatif (centre de la commune de la Gombe).", qualite="indicatif"),
        pt("P23", "kamina", "Ouverture de la route Kamina-Kabongo", "Haut-Lomami", "230 Km", 6000000.00, "Phase 3",
           "Point placé à Kamina, une extrémité de l'axe ; le tracé réel des 230 km vers Kabongo n'est pas représenté."),
        pt("P24", "kabongo", "Ouverture de la route Kabongo-Dianda-Mukwende", "Haut-Lomami", "350 Km", 5000000.00, "Phase 3",
           "Point placé à Kabongo, extrémité identifiée de l'axe ; Dianda et Mukwende n'ont pas été vérifiés indépendamment."),
        pt("P25", "bunia", "Construction d'un stade à Bunia", "Ituri", "1", 9940215.63, "Phase 3",
           "Une confusion documentée existe entre des photographies de stades de cette région : par prudence, aucun lien photo n'est proposé."),
        pt("P26", "mbuji_mayi", "Réhabilitation de la route revêtue Mbujimayi-Mwenditu", "Kasaï-Oriental", "16,62 Km", 15000000.00, "Phase 3",
           "Point placé à Mbuji-Mayi, une extrémité de l'axe vers Mwene-Ditu (province du Lomami) ; le tracé réel n'est pas représenté."),
        pt("P27", "kikwit", "Réhabilitation de la route Kikwit-Idiofa", "Kwilu", "6,35 Km", 10000000.00, "Phase 3",
           "Point placé à Kikwit, une extrémité de l'axe vers Idiofa ; le tracé réel n'est pas représenté."),
        pt("P28", "kamina", "Construction d'une unité de captage et de traitement d'eau de Kamina (Phase 1)", "Haut-Lomami", "1", 9999897.77, "Phase 3", None),
        pt("P29", "goma", "Construction d'un stade à Goma", "Nord-Kivu", "1", 9996332.43, "Phase 3",
           "Une confusion documentée existe entre des photographies de stades de Goma et de Bukavu dans plusieurs sources externes : par prudence, aucun lien photo n'est proposé."),
        pt("P30", "bukavu", "Construction d'un stade à Bukavu", "Sud-Kivu", "1", 10000000.00, "Phase 3",
           "Même prudence que pour le stade de Goma : aucun lien photo proposé (confusion documentée entre stades de la région)."),
        pt("P31", "kalemie", "Construction d'un nouveau stade à Kalemie", "Tanganyika", "1", 10000000.00, "Phase 3",
           "Même prudence que pour les stades de Goma/Bukavu : aucun lien photo proposé."),
        pt("P32", "kalemie", "Réhabilitation et modernisation de la voirie de Kalemie", "Tanganyika", "3 Km", 10000000.00, "Phase 3", None),
        pt("P33", "kalemie", "Réhabilitation et modernisation de la voirie de Kalemie Phase 1", "Tanganyika", "1,6 Km", 5000000.00, "Phase 3", None),
        pt("P35", "ankoro", "Réhabilitation de la route Kitanda-Ankoro (70 Km)", "Tanganyika", "70 Km", 5000000.00, "Phase 3",
           "Point placé à Ankoro, extrémité identifiée de l'axe ; Kitanda (petite localité, l'autre extrémité) n'a pas pu être vérifiée indépendamment."),
        pt("P36", "ankoro", "Réhabilitation de la route en terre Ankoro-Manono (115 Km)", "Tanganyika", "115 Km", 7500000.00, "Phase 3",
           "Point placé à Ankoro, une extrémité de l'axe vers Manono ; le tracé réel des 115 km n'est pas représenté."),
        pt("P37", "manono", "Réhabilitation et modernisation de la voirie de Manono", "Tanganyika", "3,838 Km", 5000000.00, "Phase 3", None),
        pt("P38", "kalemie", "Construction de la Bretelle Stade de Kalemie-Boulevard Lumumba", "Tanganyika", "1,76 Km", 5333019.45, "Phase 3", None),
        pt("P39", "lomela", "Construction du pont Lomela et de ses composantes sociales", "Sankuru", "1", 5000000.00, "Phase 4",
           "Coordonnée reprise de l'aérodrome de Lomela, qui dessert le village de Lomela — aucune coordonnée du pont lui-même n'est publiée."),
        pt("P40", "kolwezi", "Bitumage de 14 Km de route Kanina-Musonoi-Kapata", "Lualaba", "12,934 Km", 9500000.00, "Phase 4",
           "Localisation précisée « dans la ville de Kolwezi » par l'Annexe 26 ; point placé au centre de Kolwezi."),
        pt("P41", "kolwezi", "Sondage et découverture des Zones d'exploitation artisanale à Kolwezi", "Lualaba", "1", 2500000.00, "Phase 4", None),
        pt("P42", "kalemie", "Construction d'un nouveau stade à Kalemie (Phase 2)", "Tanganyika", "1", 6128606.22, "Phase 4",
           "Même prudence que pour les autres stades de la région : aucun lien photo proposé."),
        pt("P43", "kalemie", "Réhabilitation et modernisation de la voirie de Kalemie (Phase 2)", "Tanganyika", "12,5 Km", 26871393.78, "Phase 4", None),
        # Les 3 projets suivants ne citent qu'une province (sans ville) dans la
        # colonne « Localisation » du document source : placés au chef-lieu de
        # cette province plutôt qu'exclus de la carte (voir note d'en-tête du
        # fichier — qualite_geom="province").
        pt("P13", "kalemie", "Réhabilitation et modernisation de la route Lwambo-Mitwaba-Manono-Kalemie", "Tanganyika", "149,60 Km", 30000000.00, "Phase 3",
           "Localisation précisée uniquement au niveau de la province (Tanganyika) dans ce document ; point placé à Kalemie, chef-lieu de la province, à titre indicatif — ne représente pas le tracé réel de cet axe reliant Lwambo, Mitwaba, Manono et Kalemie.", qualite="province"),
        pt("P20", "kinshasa_gombe", "Fourniture des poteaux solaires", "Kinshasa", None, 11000000.00, "Phase 2",
           "Localisation précisée uniquement au niveau de la ville-province (Kinshasa) dans ce document ; point indicatif au centre de la commune de la Gombe.", qualite="province"),
        pt("P34", "kalemie", "Acquisition de poteaux solaires", "Tanganyika", None, 10000000.00, "Phase 3",
           "Localisation précisée uniquement au niveau de la province (Tanganyika) dans ce document ; point placé à Kalemie, chef-lieu de la province, à titre indicatif.", qualite="province"),
    ]
    non_geo = []

    geo["sicomines_infra"] = collections.OrderedDict([
        ("type", "FeatureCollection"),
        ("name", "infrastructures_sicomines_2007_2025"),
        ("features", features),
        ("non_georeferences", non_geo),
        ("meta", collections.OrderedDict([
            ("periode", "2007–2025"),
            ("n_points_carte", len(features)),
            ("n_projets_liste_executees", 42),
            ("n_projets_couverts_par_la_carte", 42),
            ("montant_total_liste_executees_usd", 814671507.49),
            ("n_projets_annexe26_apcsc", 77),
            ("montant_total_annexe26_usd", 1208871210.7771),
            ("note_couverture", "[Note interne, mode administrateur] Cette carte est construite à partir des 42 projets du dataset « Liste des infrastructures exécutées » (troc_sicomines_liste_executees), document fourni directement par l'utilisateur, dont le total imprimé (814 671 507,49 USD) correspond au bilan thématique SICOMINES 2008-2020 — mais ce total et le sous-total imprimé de sa Phase 3 (249 726 699,79 USD) ne correspondent pas à la somme des lignes de projets qu'ils contiennent telles que transcrites (respectivement 798 714 272,98 USD et 233 769 465,28 USD) : cet écart existe dans le document source lui-même et n'est pas arbitré ici (voir le tableau « Liste des infrastructures exécutées » pour le détail). Une source plus récente et plus complète (« Annexe 26 », 77 projets, 1 208 871 210,78 USD au 30/06/2025 — dataset troc_sicomines_annexe26_apcsc) est également publiée dans cette rubrique sous forme de tableau, mais ses localisations ne descendent pas toujours au niveau de la ville (souvent la province seule, ou plusieurs provinces pour un même projet) : elle n'a donc pas servi de base à cette carte, pour ne pas multiplier les positions approximatives. Les deux tables restent consultables intégralement ci-dessous."),
            ("note_coordonnees", "Ni la « Liste des infrastructures exécutées » ni l'Annexe 26 ne publient de coordonnées GPS : seuls des noms de lieux (ville, commune ou province) y figurent. Les coordonnées de cette carte proviennent de vérifications indépendantes (Wikipédia, latitude.to, mapcarta) de lieux réels et nommés — jamais d'estimation. Voir le champ « source_coordonnees » de chaque point. Les 42 projets sont tous représentés ; 3 d'entre eux ne citent qu'une province (sans ville) dans ce document et sont positionnés au chef-lieu de cette province (qualite_geom=\"province\") plutôt qu'exclus."),
            ("note_ecarts", "[Note interne, mode administrateur] Deux écarts de libellé/montant entre cette liste et le tableau « Projets individuellement documentés » (troc_sicomines_projets, source RFI_4.3_SICOMINES.xlsx) sont signalés tels quels sans être arbitrés : l'hôpital de Kinshasa est nommé « Hôpital du Centre Ville (Hôpital du Centenaire) » ici contre « Hôpital du Cinquantenaire » dans l'autre table (montants très proches : 114 901 200 vs 114 879 516,42 USD) ; l'esplanade du Palais du Peuple est chiffrée à 40 500 m² ici contre 24 300 m² dans l'autre table (même montant : 24 255 229,10 USD)."),
        ])),
    ])

    with open(GEO_PATH, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, indent=1)

    print(f"OK — {len(features)} points ajoutés (couvrant les 42 projets), {len(non_geo)} entité(s) non géoréférencée(s).")


if __name__ == "__main__":
    main()
