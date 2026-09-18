#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ajoute au warehouse deux tables SICOMINES transcrites STRICTEMENT à partir de
deux documents fournis directement par l'utilisateur (et non plus d'une
approximation/synthèse antérieure) :

1. troc_sicomines_liste_executees : "Liste des infrastructures exécutées"
   (tableau image fourni par l'utilisateur), 42 projets organisés en 4
   phases, avec pour chacun désignation, localisation (province),
   quantité (km, m², unités) et montant en USD. Total général
   814 671 507,49 USD — identique au montant déjà documenté dans
   troc_sicomines_infrastructures comme total du « bilan thématique
   SICOMINES 2008-2020 » (43 projets) : cette table en est très
   vraisemblablement le détail projet-par-projet, mais l'origine exacte du
   document (auteur, date) n'est pas indiquée sur l'image fournie — signalé
   comme tel plutôt que présenté comme certain.
2. troc_sicomines_annexe26_apcsc : "Annexe 26 - Décompte des projets
   d'infrastructures de la SICOMINES jusqu'au juin 2025, fourni par
   l'APCSC" (fichier Excel fourni par l'utilisateur), 77 lignes, total
   1 208 871 210,78 USD — identique au montant "APCSC — décaissements
   cumulés (USD)" déjà documenté dans troc_sicomines_infrastructures au
   titre de la « SITUATION AU 30/06/2025 ». C'est la liste la plus récente
   et la plus complète disponible : elle remplace, pour la carte
   (scripts/build_troc_sicomines_map.py), l'ancienne approximation à 8
   projets tirée de RFI_4.3_SICOMINES.xlsx (conservée telle quelle dans
   troc_sicomines_projets, par souci de ne rien effacer, mais désormais
   marquée comme moins complète que les deux tables ci-dessous).

Conformément à la règle du projet ("ne rien cacher, toutes ces données
sont publiques"), aucune ligne n'est résumée, fusionnée ou omise : les 42 et
77 lignes sont reproduites intégralement, y compris les libellés qui
semblent désigner le même ouvrage sous des noms différents d'une table à
l'autre (ex. « Hôpital du Centre Ville (Hôpital du Centenaire) » ici contre
« Hôpital du Cinquantenaire » dans troc_sicomines_projets) — signalé en
note plutôt que corrigé ou deviné.
"""
import json, collections

WH_PATH = "data/warehouse.seed.json"

# ---------------------------------------------------------------------
# 1) "Liste des infrastructures exécutées" — 42 lignes, 4 phases.
#    Transcription intégrale du tableau fourni par l'utilisateur.
#    (Phase, N°, Désignation, Localisation, Quantité, Montant USD)
# ---------------------------------------------------------------------
LISTE_EXECUTEES = [
    ("Phase 1", 1, "Bitumage de la RN5 Lubumbashi-Kasomeno", "Haut-Katanga", "137 Km", 93210305.71),
    ("Phase 1", 2, "Terrassement de la RN5 Lubumbashi Kasomeno", "Haut-Katanga", "137 Km", 69073563.80),
    ("Phase 1", 3, "Bitumage RN4 Beni-Niania", "Nord-Kivu", "60 Km", 57782941.03),
    ("Phase 1", 4, "Modernisation avenue Tourisme", "Kinshasa", "6,8 Km", 29344191.97),
    ("Phase 1", 5, "Modernisation avenue Lutendele", "Kinshasa", "4,5 Km", 21007915.30),
    ("Phase 1", 6, "Construction et achèvement de l'Hôpital centre-ville", "Kinshasa", "4500 m²", 114901200.00),
    ("Phase 2", 7, "Modernisation du Boulevard du 30 juin lot1", "Kinshasa", "5,38 Km", 25973618.36),
    ("Phase 2", 8, "Modernisation du Boulevard du 30 juin lot 2", "Kinshasa", "2,5 Km", 19341204.19),
    ("Phase 2", 9, "Modernisation du Boulevard Sendwe et Triomphal", "Kinshasa", "3,67 Km", 35894638.24),
    ("Phase 2", 10, "Aménagement et construction de l'Esplanade du Palais du Peuple", "Kinshasa", "40 500 m²", 24255229.10),
    ("Phase 2", 11, "Fournitures des Groupes électrogènes", "Kisangani", "19", 5667740.00),
    ("Phase 2", 12, "Installation d'une unité des préfabriqués", "Kisangani", "1", 7492260.00),
    ("Phase 2", 12, "Fourniture des poteaux solaires", "Kinshasa", "6626", 11000000.00),
    ("Phase 3", 13, "Modernisation de la RN5 Bukavu-Kamanyola", "Sud-Kivu", "5 Km", 13000000.00),
    ("Phase 3", 14, "Traversée de Butembo", "Nord-Kivu", "8 Km", 11000000.00),
    ("Phase 3", 15, "Réhabilitation et modernisation de la voirie de Kolwezi avec les actions sociales du Quartier Harmonie", "Lualaba", "4,657 Km", 6000000.00),
    ("Phase 3", 16, "Réhabilitation de la voirie Bunagana-Rutshuru-Goma", "Nord-Kivu", "15 Km", 10000000.00),
    ("Phase 3", 17, "Modernisation de la voirie d'Uvira (Phase 1)", "Sud-Kivu", "2,64 Km", 5000000.00),
    ("Phase 3", 18, "Modernisation de la voirie d'Uvira (Phase 2)", "Sud-Kivu", "5,5 Km", 5000000.00),
    ("Phase 3", 19, "Réhabilitation et modernisation de la route Lwambo-Mitwaba-Manono-Kalemie", "Tanganyika", "149,60 Km", 30000000.00),
    ("Phase 3", 20, "Modernisation de l'avenue Nzolana (Phase 1)", "Kinshasa", "1,4 Km", 15000000.00),
    ("Phase 3", 21, "Renforcement des Boulevards Sendwe et Triomphal", "Kinshasa", "3,67 Km", 5000000.00),
    ("Phase 3", 22, "Ouverture de la route Kamina-Kabongo", "Haut-Lomami", "230 Km", 6000000.00),
    ("Phase 3", 23, "Ouverture de la route Kabongo-Dianda-Mukwende", "Haut-Lomami", "350 Km", 5000000.00),
    ("Phase 3", 24, "Construction d'un stade à Bunia", "Ituri", "1", 9940215.63),
    ("Phase 3", 25, "Réhabilitation de la route revêtue Mbujimayi-Mwenditu", "Kasaï-Oriental", "16,62 Km", 15000000.00),
    ("Phase 3", 26, "Réhabilitation de la route Kikwit-Idiofa", "Kwilu", "6,35 Km", 10000000.00),
    ("Phase 3", 27, "Construction d'une unité de captage et de traitement d'eau de Kamina (Phase 1)", "Haut-Lomami", "1", 9999897.77),
    ("Phase 3", 28, "Construction d'un stade à Goma", "Nord-Kivu", "1", 9996332.43),
    ("Phase 3", 29, "Construction d'un stade à Bukavu", "Sud-Kivu", "1", 10000000.00),
    ("Phase 3", 30, "Construction d'un nouveau stade à Kalemie", "Tanganyika", "1", 10000000.00),
    ("Phase 3", 31, "Réhabilitation et modernisation de la voirie de Kalemie", "Tanganyika", "3 Km", 10000000.00),
    ("Phase 3", 32, "Réhabilitation et modernisation de la voirie de Kalemie Phase 1", "Tanganyika", "1,6 Km", 5000000.00),
    ("Phase 3", 33, "Acquisition de poteaux solaires", "Tanganyika", "1382", 10000000.00),
    ("Phase 3", 34, "Réhabilitation de la route Kitanda-Ankoro (70 Km)", "Tanganyika", "70 Km", 5000000.00),
    ("Phase 3", 35, "Réhabilitation de la route en terre Ankoro-Manono (115 Km)", "Tanganyika", "115 Km", 7500000.00),
    ("Phase 3", 36, "Réhabilitation et modernisation de la voirie de Manono", "Tanganyika", "3,838 Km", 5000000.00),
    ("Phase 3", 37, "Construction de la Bretelle Stade de Kalemie-Boulevard Lumumba", "Tanganyika", "1,76 Km", 5333019.45),
    ("Phase 4", 38, "Construction du pont Lomela et de ses composantes sociales", "Sankuru", "1", 5000000.00),
    ("Phase 4", 39, "Bitumage de 14 Km de route Kanina-Musonoi-Kapata", "Lualaba", "12,934 Km", 9500000.00),
    ("Phase 4", 40, "Sondage et découverture des Zones d'exploitation artisanale à Kolwezi", "Lualaba", "1", 2500000.00),
    ("Phase 4", 41, "Construction d'un nouveau stade à Kalemie (Phase 2)", "Tanganyika", "1", 6128606.22),
    ("Phase 4", 42, "Réhabilitation et modernisation de la voirie de Kalemie (Phase 2)", "Tanganyika", "12,5 Km", 26871393.78),
]
SOUS_TOTAUX = {"Phase 1": 385320117.81, "Phase 2": 129624689.89, "Phase 3": 249726699.79, "Phase 4": 50000000.00}
TOTAL_GENERAL_EXECUTEES = 814671507.49

# ---------------------------------------------------------------------
# 2) "Annexe 26 - Décompte des projets d'infrastructures de la SICOMINES
#    jusqu'au juin 2025 fourni par l'APCSC" — 77 lignes. Transcription
#    intégrale du fichier Excel fourni par l'utilisateur.
# ---------------------------------------------------------------------
ANNEXE26 = [
    (1, "Route Lutundele (Kinshasa)", 19240627.1661, "Kinshasa"),
    (2, "Avenue du Tourisme (Kinshasa)", 29344191.97, "Kinshasa"),
    (3, "Bitumage Route Lubumbashi-Kasomeno-Kasenga RN5", 92755516.92, "Haut-Katanga"),
    (4, "Terrassement Route Lubumbashi-Kasomeno-Kasenga RN5", 69073565.58, "Haut-Katanga"),
    (5, "Boulevard Sendwe et Triomphal", 34524231.94, "Kinshasa"),
    (6, "Boulevard du 30 juin Lot 1", 25943631.02, "Kinshasa"),
    (7, "Boulevard du 30 juin Lot 2", 18856314.75, "Kinshasa"),
    (8, "Bitumage RN4 Beni-Niania Lot 1", 64683853.94, "Nord-Kivu et Tshopo"),
    (9, "Hôpital du Centre Ville (Hôpital du Centenaire)", 114879516.42, "Kinshasa"),
    (10, "Esplanade Palais du Peuple Lot 1", 24255299.121, "Kinshasa"),
    (11, "Contrat d'Acquisition des équipements de production des préfabriqués et des groupes électrogènes (Contrat 2011)", 15032299.31, "—"),
    (12, "Installation des poteaux solaires et accessoires", 11000000.0, "Tanganyika"),
    (13, "Projet d'études et de travaux de réhabilitation et modernisation de la Route Lwambo-Mitwaba-Manono-Kalemie (Projet 2015)", 30000000.0, "Haut-Katanga, Haut-Lomami et Tanganyika"),
    (14, "Projet d'études et de travaux d'accompagnement de la SICOMINES KOLWEZI (Réhabilitation et Modernisation de la Voirie de Kolwezi) (Projet 2015)", 6000000.0, "Lualaba"),
    (15, "Projet d'asphaltage de la route Bukavu-Kamanyola (Projet 2015)", 13000000.0, "Sud-Kivu"),
    (16, "Projet de Modernisation de la Traversée de Butembo (Projet 2015)", 11000000.0, "Nord-Kivu"),
    (17, "Projet de Réhabilitation et de Modernisation de la Voirie de Manono (Projet 2015)", 5000000.0, "Tanganyika"),
    (18, "Projet de Construction de l'Unité de Captage et de Traitement d'eau à Kamina au Katanga (Projet 2015)", 9740014.49, "Haut-Lomami"),
    (19, "Projet de Réhabilitation et de Modernisation de la Route Kitanda-Ankoro (70Km) (Projet 2015)", 5213008.16, "Tanganyika"),
    (20, "Projet de Réhabilitation et Modernisation de la Route Ankoro-Manono (115Km) (Projet 2015)", 7500000.0, "Tanganyika"),
    (21, "Contrat d'études et travaux du projet de la construction de route devant relier l'aérogare de Kalemie et le nouveau stade de Kalemie au Boulevard de Lumumba", 5500000.0, "Tanganyika"),
    (22, "Projet de Réhabilitation et Modernisation de la Route Kamina-Kabongo (230Km) (Projet 2015)", 6000000.0, "Haut-Lomami"),
    (23, "Projet de Réhabilitation de la Route Kabondo-Dianda-Mukwende (350Km) (Projet 2015)", 5999999.999999999, "Haut-Lomami"),
    (24, "Projet de Réhabilitation et de Modernisation de la Voirie de Kisangani (Projet 2015)", 15000000.0, "Tshopo"),
    (25, "Projet de Réhabilitation et de Modernisation de la Voirie Uvira (Projet 2015)", 5000000.0, "Sud-Kivu"),
    (26, "Projet de construction d'un nouveau Stade de Bukavu (Projet 2015)", 9433134.91, "Sud-Kivu"),
    (27, "Contrat d'études, de fourniture et d'installation des poteaux solaires et accessoires (Projet 2015)", 9106864.23, "Tanganyika"),
    (28, "Projet de Réhabilitation et de Modernisation de la Route Kikwit-Idiofa (75Km) (Projet 2015)", 10000000.0, "Kwilu"),
    (29, "Projet de Renforcement de la Route revêtue Mbuji Mayi-Mwene Ditu (135Km) (Projet 2015)", 31916581.48, "Kasaï-Oriental et Lomami"),
    (30, "Projet de Réhabilitation et de Modernisation de la Voirie de Kalemie (Projet 2015)", 10000000.0, "Tanganyika"),
    (31, "Contrat d'études et travaux du projet de réhabilitation et modernisation de la Voirie de Kalemie (PK3+000~Pk4+600 de la phase 1)", 5000000.0, "Tanganyika"),
    (32, "Contrat d'études et travaux du projet de modernisation de la Voirie Uvira (phase 2)", 5000000.0, "Sud-Kivu"),
    (33, "Contrat d'Etudes et Travaux de Réhabilitation et Modernisation de la Voirie de Kalemie (Phase 2) (Projet 2015)", 26871394.09, "Tanganyika"),
    (34, "Contrat d'Etudes et Travaux de construction d'un nouveau Stade à Kalemie (Phase 2) (Projet 2015)", 6128606.22, "Tanganyika"),
    (35, "Projet de Construction d'un Nouveau Stade à Kalemie (Projet 2015)", 10000000.0, "Tanganyika"),
    (36, "Projet du Stade de Goma (Projet 2015)", 10000000.0, "Nord-Kivu"),
    (37, "Projet de construction d'un stade à Bunia (Projet 2015)", 10000000.0, "Ituri"),
    (38, "Projet de Réhabilitation et Modernisation de la Route Bunagana-Rutshuru-Goma (100Km) (Projet 2015)", 10000000.0, "Nord-Kivu"),
    (39, "Projet de réhabilitation et modernisation de l'avenue Nzolana et de lutte anti-érosive sur l'avenue Nzolana (Projet 2016)", 15000000.0, "Kinshasa"),
    (40, "Projet de renforcement des Boulevards triomphal et Sendwe à Kinshasa (Projet 2018)", 5000000.0, "Kinshasa"),
    (41, "Projet de Construction du Pont Lomela (Projet 2018)", 5000000.0, "Sankuru"),
    (42, "Projet de Bitumage de 14 Km de route entre Kanina-Musonoie-Kapata dans la ville de Kolwezi (Projet 2018)", 9500000.0, "Lualaba"),
    (43, "Travaux de sondage et découverture des Zones d'Exploitation Artisanale dans la Province du Lualaba (Projet 2018)", 1384684.65, "Lualaba"),
    (44, "Contrat d'études et travaux du projet de réhabilitation de l'avenue Nzolana Phase 2", 24605352.49, "Kinshasa"),
    (45, "Contrat d'études et travaux du projet de réhabilitation de la route MANTERNE-TSHELA-SINGINGI Phases 1 2 3", 16410804.97, "Kongo-Central"),
    (46, "Contrat d'études et travaux du projet de réhabilitation de la route Kamina-Luena RN1", 1501348.98, "Haut-Lomami"),
    (47, "Contrat d'études et travaux du projet de réhabilitation de la route Kaniama-Kamina RN1", 1995567.58, "Haut-Lomami"),
    (48, "Contrat d'études et travaux du projet de réhabilitation de la route BUKAVU-NYANGEZI-KAMANYOLA", 23222678.64, "Sud-Kivu"),
    (49, "Contrat d'études et travaux du projet de réhabilitation de la route Mweneditu-Kanyama Phase 1", 10762614.68, "Lomami, Haut-Lomami"),
    (50, "Contrat d'études et travaux du projet de réhabilitation de la route Lusambo-Lac Mukamba", 8226835.43, "Kasaï-Central et Sankuru"),
    (51, "Contrat d'études et travaux du Projet de construction du Stade BUKAVU (Phase 2)", 3083771.95, "Sud-Kivu"),
    (52, "Contrat d'études et travaux du projet de réhabilitation de la RN20, Tronçon allant du croisement de la RN1 et IDIOFA", 3214285.31, "Kwilu"),
    (53, "Projet de construction d'un Stade à IDIOFA", 2300000.0, "Kwilu"),
    (54, "Projet de construction de la Route INGUDI - IDIOFA (Phase 2)", 5750000.0, "Kwilu"),
    (55, "Contrat d'études et travaux de Projet de réhabilitation de l'Usine de Captage et de Traitement d'Eau à Kamina (Phase 2)", 857828.8, "Haut-Lomami"),
    (56, "Projet de Construction de la route périphérique Sud-Est et Sud-Ouest dans la Ville de Kinshasa", 51169519.27, "Kinshasa"),
    (57, "Projet de construction de la route MBUJIMAYI-NGUBA", 80155048.98, "Kasaï-Oriental, Lomami, Haut-Lomami, Lualaba"),
    (58, "Projet de Construction de la route KANANGA-KALAMBA MBUJI Phases 1 et 2", 17550000.0, "Kasaï-Central"),
    (59, "Projet de Réhabilitation de la route RN25 Isiro-Poko et de la route Bafwasende-Bomili-Babeyro", 961032.66, "Tshopo"),
    (60, "Projet de Modernisation de l'aérodrome de Lodja 1 & 2", 2560000.0, "Sankuru"),
    (61, "Projet de viabilisation de Lumumba-Ville, Phases 1 & 2", 2495000.0, "Sankuru"),
    (62, "Projet de réhabilitation de Bâtiment 4 de l'ISP Bukavu", 54260.99, "Sud-Kivu"),
    (63, "Projet de Construction du Stade de Bunia (les voies d'accès + finalisation des travaux)", 390000.0, "Ituri"),
    (64, "Projet de Fourniture et Installation des Poteaux Solaires Av. Kitutu", 787136.0, "Tanganyika"),
    (65, "Construction de la route BUKAVU KANYOLA, Phase 3", 4202187.41, "Sud-Kivu"),
    (66, "Projet de Réhabilitation de l'Université de Mbandaka et Equipement Phases 1 & 2", 4415600.0, "Equateur"),
    (67, "Réhabilitation de l'aérodrome de Tshikapa (piste et aérogare), Phases 1 & 2", 5015683.62, "Kasaï"),
    (68, "Construction d'un Stade de 8000 places à Kananga, Phases 1 & 2", 2820000.0, "Kasaï-Central"),
    (69, "Projet de construction de la route reliant le port de Ndomba au Village de Bena-Kazadi", 6900000.0, "Kasaï-Oriental"),
    (70, "Projet d'infrastructures sociales dans la Province du Kongo Central : Réfection école (Mbanza Boma et de Kisantu) et Hôpital de Kimpese", 1150000.0, "Kongo-Central"),
    (71, "Construction de la route BUTA - POKO - ISIRO, Phase 2", 6900000.0, "Haut-Uele & Bas-Uele"),
    (72, "Projet de la Provision pour expropriation des riverains des Rocades de Kinshasa", 5100000.0, "Kinshasa"),
    (73, "Projet de Réhabilitation et de Modernisation de l'Hôpital Général de Kikwit", 2690000.0, "Kwilu"),
    (74, "Projet de renforcement du Pont Lubuye du Projet de réhabilitation du Boulevard Lumumba à Kalemie", 941316.65, "Tanganyika (Kalemie)"),
    (75, "Frais de fonctionnement du BCPSC", 46200000.0, "Kinshasa"),
    (76, "Frais de fonctionnement de l'APCSC", 25600000.0, "Kinshasa"),
    (77, "Taxes des concentrés et Taxe voirie exigées par le Gouvernement du Lualaba", 5000000.0, "Lualaba"),
]
TOTAL_ANNEXE26 = 1208871210.7771

META_COMMON = {
    "theme": "troc_sicomines",
    "theme_label": "Fourniture d'infrastructures et accords de troc (SICOMINES)",
    "periode": "2007–2025",
    "unite": "texte, quantités (km/m²/unités) et montants (USD)",
    "devise": "USD",
    "perimetre": "Programme sino-congolais (Convention de Collaboration du 22/04/2008) et JV SICOMINES SA",
    "desagregation": "par projet individuel",
}


def ds(label, cat, desc, cols, types, rows, extra_meta):
    meta = dict(META_COMMON)
    meta.update(extra_meta)
    return {"label": label, "cat": cat, "desc": desc, "cols": cols, "types": types, "rows": rows, "meta": meta}


def main():
    with open(WH_PATH, encoding="utf-8") as f:
        wh = json.load(f, object_pairs_hook=collections.OrderedDict)

    rows1 = [[phase, n, desig, lieu, qte, montant] for (phase, n, desig, lieu, qte, montant) in LISTE_EXECUTEES]
    for phase, total in SOUS_TOTAUX.items():
        rows1.append([phase, None, f"Sous-total {phase}", None, None, total])
    rows1.append(["Total général", None, "TOTAL GENERAL", None, None, TOTAL_GENERAL_EXECUTEES])

    wh["datasets"]["troc_sicomines_liste_executees"] = ds(
        "Fourniture d'infrastructures et accords de troc — Liste des infrastructures exécutées (détail par projet)",
        "SICOMINES",
        "Liste intégrale, projet par projet, des infrastructures exécutées dans le cadre du programme sino-congolais/SICOMINES, organisée en 4 phases, telle que transmise directement par l'utilisateur (document image, source précise — auteur et date — non indiquée sur le document lui-même). Le total général (814 671 507,49 USD) correspond exactement au montant déjà documenté ailleurs dans cette rubrique comme total du bilan thématique SICOMINES 2008-2020 (43 projets) : cette table en est très probablement le détail, mais cette correspondance n'est pas garantie noir sur blanc par le document — signalée comme forte probabilité, non comme certitude.",
        ["Phase", "N°", "Désignation", "Localisation", "Quantité", "Montant USD"],
        ["str", "num", "str", "str", "str", "num"],
        rows1,
        {
            "source": "Document transmis par l'utilisateur : « Liste des infrastructures exécutées » (tableau, 4 phases) — origine précise (auteur, date) non indiquée sur le document.",
            "qualite": "Transcription intégrale et fidèle du document fourni, sans correction ni interprétation. Une même infrastructure peut porter un nom légèrement différent dans d'autres tables de cette rubrique (ex. « Hôpital du Centre Ville (Hôpital du Centenaire) » ici, « Hôpital du Cinquantenaire » dans le tableau « Projets individuellement documentés ») : ceci est reproduit tel quel, sans harmonisation arbitraire des libellés. Le sous-total imprimé de la Phase 3 (249 726 699,79 USD) ne correspond pas à la somme des 25 lignes de projets qu'elle contient telles que transcrites ici (233 769 465,28 USD, soit un écart de 15 957 234,51 USD) — cet écart existe dans le document source lui-même (aucune ligne supplémentaire n'y est visible) et n'est pas arbitré ici : le sous-total et le total général sont reproduits tels qu'imprimés dans le document, sans être recalculés. Par ailleurs, la localisation du projet n°19 (route Lwambo-Mitwaba-Manono-Kalemie) est indiquée « Tanganyika » seule dans ce document, alors que l'Annexe 26 (projet équivalent n°13) l'indique sur 3 provinces (Haut-Katanga, Haut-Lomami et Tanganyika) — également reproduit tel quel plutôt qu'harmonisé.",
        },
    )

    rows2 = [[n, desig, montant, lieu] for (n, desig, montant, lieu) in ANNEXE26]
    rows2.append([None, "TOTAL", TOTAL_ANNEXE26, None])

    wh["datasets"]["troc_sicomines_annexe26_apcsc"] = ds(
        "Fourniture d'infrastructures et accords de troc — Annexe 26 : décompte des projets (APCSC, juin 2025)",
        "SICOMINES",
        "« Annexe 26 - Décompte des projets d'infrastructures de la SICOMINES jusqu'au juin 2025, fourni par l'APCSC » (Agence pour la Promotion et la Coordination du Programme Sino-Congolais) — fichier Excel transmis directement par l'utilisateur. Liste la plus récente et la plus complète disponible dans cette rubrique : 77 lignes, total 1 208 871 210,78 USD, identique au montant « APCSC — décaissements cumulés » déjà documenté dans le tableau « Bilan et indicateurs clés » de cette rubrique (situation au 30/06/2025).",
        ["N°", "Désignation", "Investissements cumulés (USD)", "Localisation"],
        ["num", "str", "num", "str"],
        rows2,
        {
            "source": "Annexe 26 — Décompte des projets d'infrastructures de la SICOMINES jusqu'au juin 2025, fourni par l'APCSC (fichier Excel transmis par l'utilisateur).",
            "qualite": "Transcription intégrale et fidèle du fichier fourni, sans correction ni interprétation. Les localisations restent celles données par la source (province, parfois plusieurs provinces pour un même projet) : aucune coordonnée géographique précise n'y figure.",
        },
    )

    with open(WH_PATH, "w", encoding="utf-8") as f:
        json.dump(wh, f, ensure_ascii=False, indent=1)

    print(f"OK — troc_sicomines_liste_executees : {len(rows1)} lignes ; troc_sicomines_annexe26_apcsc : {len(rows2)} lignes.")
    print(f"Total datasets : {len(wh['datasets'])}")


if __name__ == "__main__":
    main()
