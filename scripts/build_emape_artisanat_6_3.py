"""
Ajoute au warehouse (data/warehouse.seed.json) les données sur l'artisanat
minier / exploitation minière artisanale et à petite échelle (EMAPE), au
titre de l'Exigence ITIE 6.3 (contribution économique du secteur, volet
informel/ASM), à partir du fichier fourni par l'utilisateur
« ITIE_RDC_Artisanat_minier_EMAPE_6.3.xlsx ».

Ce fichier compile des indicateurs (production, exportations, opérateurs,
recettes, réserves) tirés de trois rapports thématiques ITIE-RDC dédiés à
l'EMAPE (3T & Or ; Cuivre-Cobalt-Zinc ; Diamant) et d'un rapport
complémentaire sur la chaîne de valeur artisanale Cu-Co-Zinc — la
Validation ITIE-RDC ayant relevé l'absence, dans le Rapport ITIE annuel
lui-même, d'une estimation de l'économie extractive informelle.

Principe (« ne rien cacher ») : les valeurs et libellés sont repris tels
quels ; les liens vers les rapports sources (Google Drive) sont les liens
hypertexte effectivement présents dans le fichier fourni, jamais des URL
recréées ou devinées.
"""
from __future__ import annotations

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WAREHOUSE_PATH = BASE_DIR / "data" / "warehouse.seed.json"

SOURCE_XLSX = (
    "« ITIE_RDC_Artisanat_minier_EMAPE_6.3.xlsx », fourni directement par "
    "l'utilisateur (2026-09-24) — compilation d'indicateurs tirés des "
    "rapports thématiques ITIE-RDC sur l'exploitation minière artisanale "
    "et à petite échelle (EMAPE), au titre de l'Exigence ITIE 6.3."
)

THEME_KEY = "contribution_eco"

COMMON_META = dict(
    theme=THEME_KEY,
    theme_label="Contribution économique du secteur",
    source=SOURCE_XLSX,
)

DATASETS: dict = {}


def add(name, label, cat, desc, cols, types, rows, **meta_over):
    meta = dict(COMMON_META)
    meta.update(meta_over)
    DATASETS[name] = dict(label=label, cat=cat, desc=desc, cols=cols, types=types, rows=rows, meta=meta)


# ---------------------------------------------------------------------------
# Données extraites du fichier Excel (openpyxl, data_only=True), y compris
# les liens hypertexte réels associés aux cellules "Ouvrir".
# ---------------------------------------------------------------------------

# Rapports sources EMAPE : [Rapport, Filières couvertes, Périmètre (exercices
# / zones), Statut, Lien (URL réelle du fichier)]
SOURCES = [['Rapport ITIE EMAPE — Artisanat 3T & Or', 'Cassitérite (Étain), Coltan (Tantale), Wolframite (Tungstène), Or', "Exercices 2020-2021 · 6 provinces de l'Est (Haut-Uélé, Ituri, Maniema, Nord-Kivu, Sud-Kivu, Tanganyika)", 'Adopté par le CE le 27/11/2023 (Mazars)', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Rapport ITIE EMAPE — Filière Cuivre-Cobalt-Zinc', 'Cuivre, Cobalt, Zinc', 'Exercices 2022-2024 · zone Sud (Grand Katanga)', 'Version finale juillet 2025', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Rapport ITIE EMAPE — Filière Diamant', 'Diamant', 'Exercices 2021-2022 · Kasaï & Kasaï Oriental', 'Rapport final 18/11/2025', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Rapport ITIE — Secteur ASM chaîne de valeur Cu-Co-Zinc', 'Cuivre, Cobalt, Zinc', 'Rapport final 27/03/2023', 'Complément (chaîne de valeur artisanale)', 'https://drive.google.com/file/d/1ApNyRCy2X2t2rU5xEy-GF7ZfjcWqwnfC/view']]

# Détail EMAPE (54 lignes) : [Filière / Minerai, Domaine, Indicateur /
# Détail, Année, Valeur, Unité, Source (rapport), Lien (URL réelle)]
DETAIL = [['Or', 'Production', "Production d'or ARTISANALE déclarée", 2020, 76.13, 'kg', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Or', 'Production', "Production d'or ARTISANALE déclarée", 2021, 135.93, 'kg', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Or', 'Production', "Production d'or industrielle", 2020, 29520.52, 'kg', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Or', 'Production', "Production d'or industrielle", 2021, 31308.86, 'kg', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Or', 'Production', "Production d'or TOTALE", 2020, 29596.65, 'kg', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Or', 'Production', "Production d'or TOTALE", 2021, 31444.99, 'kg', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Or', 'Constat', "Part de l'artisanal dans l'or déclaré (forte sous-déclaration)", 2021, 0.43, '%', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Coltan (Tantale)', 'Production', 'Production artisanale de Coltan', 2020, 1711.73, 'tonnes', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Coltan (Tantale)', 'Production', 'Production artisanale de Coltan (Nord-Kivu 85,7% · Sud-Kivu 14,1% · Maniema 0,2%)', 2021, 1291.03, 'tonnes', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Coltan (Tantale)', 'Production', 'Production de Coltan (artisanale + industrielle)', 2021, 1439.75, 'tonnes', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Cassitérite (Étain)', 'Exportation', 'Valeur des exportations artisanales — Cassitérite', 2021, 97420487, 'USD', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Coltan (Tantale)', 'Exportation', 'Valeur des exportations artisanales — Tantale', 2021, 54115121, 'USD', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Wolframite (Tungstène)', 'Exportation', 'Valeur des exportations artisanales — Wolframite', 2021, 2492751, 'USD', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Cassitérite (Étain)', 'Exportation', 'Volume exporté — Cassitérite', 2020, 2564575, 'kg', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Cassitérite (Étain)', 'Exportation', 'Valeur exportée — Cassitérite', 2020, 68982052, 'USD', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['3T & Or', 'Opérateurs', "Coopératives artisanales recensées (SAEMAPE, 6 provinces de l'Est)", 2021, 618, 'coopératives', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['3T & Or', 'Opérateurs', 'Coopératives — Haut-Uélé', 2021, 100, 'coopératives', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['3T & Or', 'Opérateurs', 'Coopératives — Ituri', 2021, 150, 'coopératives', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['3T & Or', 'Opérateurs', 'Coopératives — Maniema', 2021, 136, 'coopératives', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['3T & Or', 'Opérateurs', 'Coopératives — Nord-Kivu', 2021, 45, 'coopératives', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['3T & Or', 'Opérateurs', 'Coopératives — Sud-Kivu', 2021, 114, 'coopératives', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['3T & Or', 'Opérateurs', 'Coopératives — Tanganyika', 2021, 73, 'coopératives', 'Rapport ITIE EMAPE 3T & Or (adopté 27/11/2023) — sources SAEMAPE/CEEC/DGDA/Min. Mines', 'https://drive.google.com/file/d/12382GVMMnuc1ZadgSRwMxhn_bAsBUfdP/view'], ['Cuivre', 'Production', 'Production nationale de cuivre', 2022, 2394630, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cuivre', 'Production', 'Production nationale de cuivre', 2023, 2842022, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cuivre', 'Production', 'Production nationale de cuivre', 2024, 3100234, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cobalt', 'Production', 'Production nationale de cobalt', 2022, 115371, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cobalt', 'Production', 'Production nationale de cobalt', 2023, 139840, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cobalt', 'Production', 'Production nationale de cobalt', 2024, 198777, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Zinc', 'Production', 'Production nationale de zinc', 2022, 13578, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Zinc', 'Production', 'Production nationale de zinc', 2023, 13404, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Zinc', 'Production', 'Production nationale de zinc', 2024, 43590, 'tonnes', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cuivre', 'Réserves', 'Réserves à fin 2024', 2024, 80000, 'kT', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cobalt', 'Réserves', 'Réserves à fin 2024', 2024, 6000, 'kT', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Zinc', 'Réserves', 'Réserves à fin 2024', 2024, 3445, 'kT', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cobalt', 'Contexte', 'Part de la RDC dans la production mondiale de cobalt', 2024, 76, '%', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Cuivre', 'Contexte', 'Rang mondial de la RDC (production de cuivre)', 2024, 2, 'rang mondial', 'Rapport ITIE EMAPE Cuivre-Cobalt-Zinc (juillet 2025) — source CTCPM/Min. Mines', 'https://drive.google.com/file/d/1pBGVumtkRzqG30uSF-Wbym4FrBWZlpKE/view'], ['Diamant', 'Production', 'Production déclarée (DPM)', 2021, 3614940, 'carats', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Production', 'Production déclarée (DPM)', 2022, 2964477, 'carats', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Production', 'Production déclarée (SAEMAPE)', 2021, 3808838, 'carats', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Production', 'Production déclarée (SAEMAPE)', 2022, 4674525, 'carats', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Exportation', 'Valeur des exportations (DPM)', 2021, 14332581, 'USD', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Exportation', 'Valeur des exportations (DPM)', 2022, 16384712, 'USD', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Prix', 'Prix moyen du carat', 2022, 11, 'USD/carat', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Réserves', 'Réserves de la RDC (≈18% de la production mondiale)', 2024, 150, 'millions de carats', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Potentiel', 'Potentiel — Kasaï Oriental', 2022, 8.01, 'millions de carats', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Opérateurs', 'Coopératives (Kasaï & Kasaï Oriental)', 2021, 27, 'coopératives', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Opérateurs', 'Coopératives (Kasaï & Kasaï Oriental)', 2022, 38, 'coopératives', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Opérateurs', 'Dragues', 2021, 66, 'dragues', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Opérateurs', 'Dragues', 2022, 68, 'dragues', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Opérateurs', 'Négociants', 2021, 234, 'négociants', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Opérateurs', 'Négociants', 2022, 147, 'négociants', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Opérateurs', 'Comptoirs', 2021, 4, 'comptoirs', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Recettes', 'Recettes EMAPE encaissées', 2021, 4479514317, 'CDF', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view'], ['Diamant', 'Recettes', 'Recettes EMAPE encaissées', 2022, 4560879086, 'CDF', 'Rapport ITIE EMAPE Diamant (18/11/2025) — sources DPM/SAEMAPE/CEEC/DGDA', 'https://drive.google.com/file/d/1XOHS_J1AmzFMCHS4JU8HXbq8yo0e-3Hx/view']]

print("Extraction EMAPE : ", len(SOURCES), "rapports sources ;", len(DETAIL), "lignes de détail")


# ---------------------------------------------------------------------------
# 1) Rapports sources EMAPE
# ---------------------------------------------------------------------------
cols_src = ["Rapport", "Filières couvertes", "Périmètre (exercices / zones)", "Statut", "Lien vers le rapport"]
types_src = ["str", "str", "str", "str", "str"]
add(
    "emape_rapports_sources",
    "Artisanat minier (EMAPE) — rapports thématiques ITIE-RDC (sources)",
    "Artisanat minier (EMAPE) — Exigence 6.3",
    "Les rapports thématiques ITIE-RDC consacrés à l'exploitation minière artisanale et à petite échelle, dont "
    "sont tirées les données de ce thème : périmètre couvert (filières, exercices, zones géographiques) et statut "
    "d'adoption de chacun.",
    cols_src, types_src, SOURCES,
    unite="n/a",
    perimetre="Rapports thématiques ITIE-RDC sur l'EMAPE : 3T & Or (6 provinces de l'Est, 2020-2021), Cuivre-Cobalt-Zinc (Grand Katanga, 2022-2024), Diamant (Kasaï & Kasaï Oriental, 2021-2022), et le rapport complémentaire sur la chaîne de valeur artisanale Cu-Co-Zinc (2023).",
    desagregation="rapport, filière",
)

# ---------------------------------------------------------------------------
# 2) Détail EMAPE
# ---------------------------------------------------------------------------
cols_detail = ["Filière / Minerai", "Domaine", "Indicateur / Détail", "Année", "Valeur", "Unité", "Source (rapport ITIE EMAPE)", "Lien vers le rapport"]
types_detail = ["str", "str", "str", "num", "num", "str", "str", "str"]
add(
    "emape_indicateurs",
    "Artisanat minier (EMAPE) — indicateurs par filière (production, exportations, opérateurs, recettes, réserves)",
    "Artisanat minier (EMAPE) — Exigence 6.3",
    "54 indicateurs, filière par filière (3T, Or, Cuivre, Cobalt, Zinc, Diamant) : volumes de production artisanale "
    "et industrielle, valeurs et volumes exportés, nombre d'opérateurs (coopératives, dragues, négociants, "
    "comptoirs), recettes encaissées et réserves — permettant d'apprécier le poids de l'artisanat minier à côté "
    "de la production industrielle, qui reste couverte séparément par le Rapport ITIE annuel.",
    cols_detail, types_detail, DETAIL,
    unite="Selon l'indicateur : kg, tonnes, carats, USD, CDF, %, nombre d'opérateurs, rang mondial, kT (voir la colonne Unité pour chaque ligne)",
    perimetre="Filières 3T (cassitérite, coltan, wolframite), Or, Cuivre, Cobalt, Zinc, Diamant — exercices et zones propres à chaque rapport thématique (voir « emape_rapports_sources »).",
    desagregation="filière, domaine (production / exportation / opérateurs / recettes / réserves / contexte), année",
    qualite=(
        "Les périodes couvertes diffèrent d'une filière à l'autre selon la date de publication de chaque rapport "
        "thématique (2020-2021 pour 3T & Or, 2022-2024 pour Cuivre-Cobalt-Zinc, 2021-2022 pour le Diamant) : ce "
        "thème ne constitue donc pas une série annuelle homogène mais une compilation de constats filière par "
        "filière, tels que publiés. La ligne « Part de l'artisanal dans l'or déclaré » (2021, 0,43 %) illustre le "
        "constat central de ces rapports : une forte sous-déclaration de la production artisanale d'or par "
        "rapport à la production industrielle."
    ),
)


def main() -> None:
    warehouse = json.loads(WAREHOUSE_PATH.read_text(encoding="utf-8"))
    warehouse.setdefault("datasets", {})

    added, updated = [], []
    for name, d in DATASETS.items():
        if name in warehouse["datasets"]:
            updated.append(name)
        else:
            added.append(name)
        warehouse["datasets"][name] = d

    WAREHOUSE_PATH.write_text(
        json.dumps(warehouse, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"Ajoutés : {len(added)} -> {added}")
    print(f"Mis à jour : {len(updated)} -> {updated}")
    print(f"Total datasets dans le warehouse : {len(warehouse['datasets'])}")


if __name__ == "__main__":
    main()
