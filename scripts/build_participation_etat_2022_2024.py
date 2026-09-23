"""
Ajoute au warehouse (data/warehouse.seed.json) les jeux de données consolidés
2022-2024 sur la participation de l'État et des entreprises publiques (EP)
du secteur extractif, en réponse aux observations du Rapport de Validation
ITIE-RDC sur les Exigences 2.6 (Participation de l'État), 4.2 (Vente des
revenus en nature de l'État), 4.5 (Transactions liées aux entreprises
d'État) et 6.2 (Dépenses quasi budgétaires).

Source : note de synthèse « Donnees_EP_.md » fournie par l'utilisateur,
elle-même construite à partir des pièces transmises par GÉCAMINES, SAKIMA,
SOKIMO, COMINIERE et SCMK-Mn (exercices 2022-2024, avec quelques éléments
de situation 2025).

Principe (« ne rien cacher, toutes ces données sont publiques ») : toutes
les incohérences, divergences et lacunes signalées dans la note source sont
reproduites telles quelles (dans les colonnes Observation et/ou les champs
meta.qualite), jamais résolues ou arbitrées par une valeur « corrigée »
inventée. Quand une donnée est inconnue, absente ou non applicable, la
cellule numérique est laissée à None et l'explication figure en toutes
lettres dans la colonne Observation.

Toutes les données ci-dessous sont tirées mot pour mot / chiffre pour
chiffre de la note de synthèse fournie ; aucune valeur n'est estimée ou
extrapolée.
"""
from __future__ import annotations

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WAREHOUSE_PATH = BASE_DIR / "data" / "warehouse.seed.json"

SOURCE_NOTE = (
    "Note de synthèse consolidée à partir des pièces transmises par "
    "GÉCAMINES, SAKIMA, SOKIMO, COMINIERE et SCMK-Mn (2022-2024, éléments de "
    "situation 2025) et du Rapport de Validation ITIE-RDC (Exigences 2.6, "
    "4.2, 4.5, 6.2)"
)

PERIMETRE_EP = (
    "Cinq entreprises publiques du secteur extractif disposant de pièces "
    "transmises pour la période : GÉCAMINES, SAKIMA, SOKIMO, COMINIERE, "
    "SCMK-Mn. Ne constitue pas un périmètre national exhaustif : les "
    "entreprises publiques non représentées dans le corpus (ex. MIBA, "
    "SOKIMEX, etc. lorsqu'elles ne figurent pas comme bénéficiaires) ainsi "
    "que toute recette non déclarée par les cinq entreprises précitées en "
    "sont exclues."
)

COMMON_META = dict(
    theme="entreprises_publiques",
    theme_label="Entreprises publiques",
    devise="USD sauf mention contraire (certains paiements SAKIMA en CDF)",
    source=SOURCE_NOTE,
    perimetre=PERIMETRE_EP,
    desagregation="entreprise, exercice, poste/rubrique",
)

DATASETS: dict = {}


def add(name, label, cat, desc, cols, types, rows, **meta_over):
    meta = dict(COMMON_META)
    meta.update(meta_over)
    DATASETS[name] = dict(label=label, cat=cat, desc=desc, cols=cols, types=types, rows=rows, meta=meta)


# ---------------------------------------------------------------------------
# 1) Recettes des partenariats — détail 2024 (Exigence 4.5)
# ---------------------------------------------------------------------------
COLS_DETAIL = ["Entreprise publique", "Exercice", "Poste de recette", "Partenaire / tiers", "Montant", "Devise", "Observation", "Source (pièce, page)"]
TYPES_DETAIL = ["str", "num", "str", "str", "num", "str", "str", "str"]

rows_detail = []

def r(ep, ex, poste, tiers, montant, devise, obs, src):
    rows_detail.append([ep, ex, poste, tiers, montant, devise, obs, src])

# GÉCAMINES 2024 — dividendes par partenaire (section 4.2)
for tiers, m in [
    ("COMMUS", 67923096.88), ("Kambove Mining", 7427593.06), ("MKM", 423466.10),
    ("SICOMINES", 185178500.56), ("SOMIDEZ", 27720000.0), ("TFM", 63000000.0),
]:
    r("GÉCAMINES", 2024, "Dividendes", tiers, m, "USD", "", "GÉCAMINES, pp. 17-18")

for tiers, m in [("Kambove Mining", 3000000.0), ("SOMIDEZ", 10000000.0)]:
    r("GÉCAMINES", 2024, "Frais de services", tiers, m, "USD", "", "GÉCAMINES, pp. 17-18")

for tiers, m in [
    ("CHEMAF", 343952.0), ("CMT", 15465.0), ("CNMC Congo Compagnie", 7740.0),
    ("COMIKA", 28368.0), ("COMMUS", 178020.0), ("Divine Land Mining", -10320.0),
    ("Huachin Metal Leach", 20640.0), ("Kinga Kila Mining", 290895.0),
    ("Luilu Ressources", 486330.0), ("MIKAS", 36120.0), ("MMG Kinsevere", 4060979.59),
    ("New Minerals Investment", 204750.0), ("SICOMINES", 214636.0), ("SMCO", 55900.0),
    ("STL", 10320.0),
]:
    obs = "Valeur négative telle qu'imprimée dans le document source (non corrigée)" if m < 0 else ""
    r("GÉCAMINES", 2024, "Loyers d'amodiation", tiers, m, "USD", obs, "GÉCAMINES, pp. 17-18")

for tiers, m in [
    ("Congo Moon Mining", 1482700.0), ("Kayammico", 1500000.0),
    ("New Minerals Investment", 2500000.0),
]:
    r("GÉCAMINES", 2024, "Pas-de-porte", tiers, m, "USD", "", "GÉCAMINES, pp. 17-18")

for tiers, m in [
    ("Boss Mining", 319042.55), ("COMILU", 2026697.19), ("COMMUS", 6904877.20),
    ("GCK", 584975.85), ("Golden African Resources (ligne 1)", 164965.74),
    ("Golden African Resources (ligne 2)", 109753.60), ("Huachin Metal Leach", 164695.34),
    ("Kaipeng", 3694497.84), ("Kambove Mining", 3399400.67), ("Luilu Ressources", 1190011.84),
    ("MM Mining", 25172.0), ("New Minerals Investment", 3314103.82),
    ("Ruashi Mining", 2362502.76), ("SEK", 682536.51), ("SOMIDEZ", 7378945.0),
]:
    r("GÉCAMINES", 2024, "Royalties", tiers, m, "USD", "Golden African Resources apparaît sur deux lignes distinctes dans le document source" if "Golden African" in tiers else "", "GÉCAMINES, pp. 17-18")

for tiers, m in [("SIMCO", 129124648.53), ("TFM", 200000000.0)]:
    r("GÉCAMINES", 2024, "Autres produits", tiers, m, "USD", "", "GÉCAMINES, pp. 17-18")

# SAKIMA 2024 (agrégat, pas de détail par partenaire dans la pièce)
for poste, m in [
    ("Loyers", 950000.0), ("Royalties", 818947.0),
    ("Frais administratifs / confidentialité", 200000.0), ("Pas-de-porte", 1100000.0),
    ("Autres recettes (dont subvention d'exploitation, voir ent_subventions_recues)", 565627.0),
]:
    r("SAKIMA", 2024, poste, "Ensemble des partenaires", m, "USD", "", "SAKIMA, p. 4")

# SOKIMO 2024
r("SOKIMO", 2024, "Dividendes", "Kibali Gold Mines", 13475000.0, "USD",
  "Sept paiements en 2024 (1er février, 27 mars, 7 août, 10 septembre, 31 octobre, deux paiements le 20 décembre)",
  "SOKIMO, p. 4")
r("SOKIMO", 2024, "Pénalités (non-dépôt étude de faisabilité)", "Giro Gold Fields", 1300000.0, "USD", "", "SOKIMO, p. 4")
r("SOKIMO", 2024, "Quote-part de production alluvionnaire", "Giro Gold Fields", 442790.0, "USD",
  "Déclarée en USD, non en volume physique — voir ent_revenus_nature", "SOKIMO, p. 4")

# COMINIERE 2024
r("COMINIERE", 2024, "Avance sur dividende", "SEGMAL", 300000.0, "USD", "", "COMINIERE, p. 5")
r("COMINIERE", 2024, "Avance sur royalties", "Manono Lithium", 1000000.0, "USD", "", "COMINIERE, p. 5")
r("COMINIERE", 2024, "Première tranche de pas-de-porte", "Manono Lithium", 30469250.0, "USD", "", "COMINIERE, p. 5")
r("COMINIERE", 2024, "Royalties", "MMR", 55353.0, "USD", "", "COMINIERE, p. 5")
r("COMINIERE", 2024, "Amodiation", "CHEMAF", 20000.0, "USD", "", "COMINIERE, p. 5")
r("COMINIERE", 2024, "Royalties", "Congo Jiaxing", 23510.0, "USD", "", "COMINIERE, p. 5")

# SCMK-Mn 2024
r("SCMK-Mn", 2024, "Recettes de partenariats", "Ensemble", None, "USD",
  "Aucune recette 2024 déclarée ; partenariats (SCM/Taurian, MRC/Blue Sky Mining) non opérationnels",
  "SCMK-Mn, pp. 2-3")

add(
    "ent_recettes_partenariats_detail",
    "Recettes des partenariats des entreprises publiques — détail 2024",
    "Entrepôt consolidé 2022-2024",
    "Détail, poste par poste et, lorsque disponible, partenaire par partenaire, des recettes contractuelles "
    "perçues en 2024 par GÉCAMINES, SAKIMA, SOKIMO, COMINIERE et SCMK-Mn auprès de leurs partenariats "
    "(dividendes, loyers d'amodiation, pas-de-porte, royalties, pénalités, frais de services, autres produits). "
    "Répond à l'Exigence ITIE 4.5 (transactions liées aux entreprises d'État) et complète l'Exigence 2.6.",
    COLS_DETAIL, TYPES_DETAIL, rows_detail,
    periode="2024",
    unite="USD (valeurs telles que déclarées par chaque entreprise, non retraitées)",
    qualite=(
        "Le total documenté (voir ent_recettes_partenariats_evolution) n'est PAS un total national : il "
        "exclut toute entreprise publique non représentée dans le corpus et toute recette non déclarée. "
        "Une valeur négative (Divine Land Mining, -10 320 USD) apparaît telle quelle dans la pièce GÉCAMINES "
        "sans explication fournie par l'entreprise ; elle est reproduite sans correction. SCMK-Mn ne déclare "
        "aucune recette 2024, ses partenariats n'étant pas encore opérationnels."
    ),
)

# ---------------------------------------------------------------------------
# 2) Évolution 2022-2024 des recettes de partenariats (agrégats annuels)
# ---------------------------------------------------------------------------
cols_evo = ["Entreprise publique", "Indicateur", "2022 (USD)", "2023 (USD)", "2024 (USD)", "Évolution", "Observation", "Source"]
types_evo = ["str", "str", "num", "num", "num", "str", "str", "str"]
rows_evo = [
    ["GÉCAMINES", "Recettes et autres produits documentés", 542168359.52, None, 737545978.63,
     "+36,04 % entre 2022 et 2024",
     "Exercice 2023 non fourni dans les pièces. Les libellés « autres produits » de 2022 et 2024 ne sont pas "
     "entièrement homogènes ; la comparaison doit être lue avec cette réserve. Détail 2022 : dividendes "
     "404 322 314,89 ; frais de consultance 11 052 007,09 ; loyers d'amodiation 5 607 904,27 ; pas-de-porte "
     "53 808 208,28 ; prestations de services 22 750 000 ; royalties 34 627 964,99 (sous-total "
     "532 168 399,52, arithmétiquement cohérent) + 9 999 960 USD d'autres produits financiers SIMCO présentés "
     "séparément = 542 168 359,52 USD.",
     "GÉCAMINES, section 4.6"],
    ["SAKIMA", "Recettes contractuelles", 2595398.0, 2456617.0, 3634574.0,
     "-5,35 % en 2023 ; +47,95 % en 2024 ; +40,04 % par rapport à 2022", "", "SAKIMA, section 4.6"],
    ["SOKIMO", "Recettes des partenariats", None, 11520000.0, 15217790.0,
     "+32,10 % en 2024", "Exercice 2022 non fourni dans les pièces.", "SOKIMO, section 4.6"],
    ["COMINIERE", "Investissement déclaré (indicateur d'activité, non une recette)", None, 3591226.0, 3304280.0,
     "-7,99 % entre 2023 et 2024",
     "Aucun investissement déclaré pour 2022. Investissement 2023 : appartement à Kinshasa, terrain à Luano, "
     "camp et bureau à Mitwaba. Investissement 2024 : acquisition d'engins à Mitwaba.",
     "COMINIERE, section 4.6"],
    ["Total documenté (4 entreprises)", "Recettes 2024 (GÉCAMINES + SAKIMA + SOKIMO + COMINIERE)",
     None, None, 788266455.63, "",
     "Répartition 2024 : GÉCAMINES 93,57 % ; COMINIERE 4,04 % ; SOKIMO 1,93 % ; SAKIMA 0,46 %. Ce total exclut "
     "SCMK-Mn (aucune recette 2024 déclarée) et toute entreprise publique non représentée dans le corpus — ce "
     "n'est pas un total national.",
     "Calcul à partir des totaux par entreprise (section 4.1)"],
]
add(
    "ent_recettes_partenariats_evolution",
    "Recettes des partenariats des entreprises publiques — évolution 2022-2024",
    "Entrepôt consolidé 2022-2024",
    "Totaux annuels de recettes contractuelles par entreprise publique, tels que documentés dans les pièces "
    "transmises, avec les taux d'évolution calculables. Les cases vides correspondent à un exercice non fourni "
    "dans les pièces reçues (absence de donnée, non une valeur nulle).",
    cols_evo, types_evo, rows_evo,
    periode="2022-2024",
    unite="USD",
    desagregation="entreprise, exercice",
    qualite=(
        "Séries incomplètes : GÉCAMINES 2023 et SOKIMO 2022 ne sont pas documentés dans les pièces reçues. "
        "Les comparaisons ne constituent pas un agrégat national et, pour GÉCAMINES, les libellés « autres "
        "produits » de 2022 et 2024 ne sont pas parfaitement homogènes (voir colonne Observation)."
    ),
)

# ---------------------------------------------------------------------------
# 3) Anomalies temporelles SAKIMA (traçabilité, Exigence 2.6/4.5)
# ---------------------------------------------------------------------------
cols_anom = ["Tableau source (exercice affiché)", "Anomalie", "Montant concerné (USD)", "Date réelle du paiement", "Observation", "Source"]
types_anom = ["str", "str", "num", "str", "str", "str"]
rows_anom = [
    ["2022", "Frais administratif BASEMINE daté de 2023 inclus dans le tableau 2022", 50000.0, "23 mars 2023", "", "SAKIMA, section 4.7"],
    ["2022", "Frais administratif CDC daté de 2023 inclus dans le tableau 2022", 100000.0, "11 mars 2023", "", "SAKIMA, section 4.7"],
    ["2023", "Royalty KIBARA datée de 2024 incluse dans le tableau 2023", 20000.0, "24 mai 2024", "", "SAKIMA, section 4.7"],
    ["2023", "Frais COMIBA daté de 2022 inclus dans le tableau 2023", 50000.0, "4 juillet 2022", "", "SAKIMA, section 4.7"],
    ["2024 (aperçu annexé à la pièce 2023)", "Loyers d'amodiation affichés à 890 000 USD contre 950 000 USD dans la réponse 2024 complète", 60000.0, "vraisemblablement 28 novembre 2024",
     "Écart de 60 000 USD entre les deux versions ; correspond vraisemblablement à un paiement ajouté dans la version complète — à confirmer par SAKIMA.", "SAKIMA, section 4.7"],
]
add(
    "ent_recettes_anomalies_rattachement_exercice",
    "Anomalies de rattachement à l'exercice — recettes SAKIMA 2022-2024",
    "Entrepôt consolidé 2022-2024",
    "Lignes de recettes ou de paiements dont la date réelle de paiement ne correspond pas à l'exercice affiché "
    "par le tableau source, signalées explicitement dans la note de synthèse afin de documenter la fiabilité "
    "des séries 2022-2024 (Priorité 1 des lacunes identifiées, section 10).",
    cols_anom, types_anom, rows_anom,
    periode="2022-2024",
    unite="USD",
    qualite=(
        "Ces anomalies montrent que les totaux annuels imprimés dans les tableaux sources ne peuvent pas être "
        "pris tels quels sans rattachement à la date effective de paiement et rapprochement bancaire. Elles "
        "sont conservées ici sans correction des totaux annuels eux-mêmes (voir ent_recettes_partenariats_evolution)."
    ),
)

# ---------------------------------------------------------------------------
# 4) Prêts accordés par les entreprises publiques (Exigence 2.6)
# ---------------------------------------------------------------------------
cols_pa = ["Entreprise prêteuse", "Bénéficiaire", "Montant prêté (USD)", "Stock fin 2024 (USD)", "Taux / modalités disponibles", "Observation", "Source"]
types_pa = ["str", "str", "num", "num", "str", "str", "str"]
rows_pa = [
    ["GÉCAMINES", "CTL", 7423088.16, 7423088.16, "0 % ; autres modalités non disponibles", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "CIMENKAT", 11044521.00, 11044521.00, "0 % ; autres modalités non disponibles", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "SODIMICO", 18328414.14, 18328414.14, "0 % ; autres modalités non disponibles", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "SOGETEL", 2323390.75, 2323390.75, "0 % ; autres modalités non disponibles", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "SIMCO", 8949328.10, 8949328.10, "0 % ; autres modalités non disponibles", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "EGC", 4000000.00, 12050000.00, "Dates 8 juin 2020 et 2 juillet 2024 ; lecture du taux ambiguë dans la pièce ; remboursement par douzièmes après grâce",
     "Le stock fin 2024 (12 050 000) est supérieur au montant prêté indiqué (4 000 000) sans explication fournie — l'écart n'est pas expliqué par la pièce.", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "STL", 20000000.00, 20000000.00, "2 juillet 2024 ; 9 % ; remboursement intégral", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "AGRICO", 13000000.00, 13000000.00, "27 août 2024 ; 0 %", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "MIBA", 5000000.00, 5000000.00, "15 mai 2018 ; 5 % ; 48 mois ; 138 888,89 USD/mois", "", "GÉCAMINES, section 6.1"],
    ["GÉCAMINES", "Total source (9 bénéficiaires)", 90068742.15, 98118742.15, "",
     "L'écart entre le montant initial total (90 068 742,15) et le stock fin 2024 total (98 118 742,15) n'est "
     "pas expliqué par la pièce ; il provient essentiellement de la ligne EGC. Une conciliation officielle est nécessaire.",
     "GÉCAMINES, section 6.1"],
    ["SOKIMO", "Aucun bénéficiaire", None, None, "Sans objet", "SOKIMO déclare n'avoir accordé aucun prêt à ses partenariats en 2024-2025.", "SOKIMO, section 5.1"],
    ["SCMK-Mn", "Aucun bénéficiaire", None, None, "Sans objet", "SCMK-Mn déclare n'avoir accordé aucun prêt, aucune garantie et aucune avance fiscale.", "SCMK-Mn, section 5.3"],
    ["COMINIERE", "Aucun bénéficiaire", None, None, "Sans objet", "COMINIERE déclare n'avoir accordé ni reçu aucun prêt.", "COMINIERE, section 4.5"],
]
add(
    "ent_prets_accordes",
    "Prêts accordés par les entreprises publiques — situation fin 2024",
    "Entrepôt consolidé 2022-2024",
    "Prêts accordés par les entreprises publiques du secteur extractif à des tiers (filiales, partenaires, "
    "entreprises publiques sœurs), avec montant initial, stock restant dû fin 2024 et modalités connues. "
    "Répond à l'Exigence ITIE 2.6 (prêts et garanties).",
    cols_pa, types_pa, rows_pa,
    periode="jusqu'à fin 2024",
    unite="USD",
    qualite=(
        "Les dates de décaissement, durées, échéanciers et garanties ne sont pas disponibles pour plusieurs "
        "prêts GÉCAMINES (CTL, CIMENKAT, SODIMICO, SOGETEL, SIMCO). Aucune information sur d'éventuels prêts "
        "accordés par SAKIMA n'est disponible dans les pièces reçues (absence de donnée, à ne pas confondre "
        "avec une déclaration explicite de « néant »)."
    ),
)

# ---------------------------------------------------------------------------
# 5) Emprunts reçus par les entreprises publiques (Exigence 2.6)
# ---------------------------------------------------------------------------
cols_er = ["Entreprise emprunteuse", "Prêteur", "Montant reçu (USD)", "Stock fin 2024 (USD)", "Taux", "Garantie", "Observation", "Source"]
types_er = ["str", "str", "num", "num", "str", "str", "str", "str"]
rows_er = [
    ["GÉCAMINES", "Krill Ventures", 20000000.0, 32333860.0, "0 %", "Garantie sur les dividendes de GÉCAMINES dans la JV concernée",
     "L'accroissement du stock (20 000 000 → 32 333 860) doit être rapproché des intérêts, pénalités et écritures de change.", "GÉCAMINES, section 6.2"],
    ["GÉCAMINES", "Prêteur illisible dans la pièce", 11514593.0, 5693634.0, "Non disponible", "Remboursement/garantie par compensation de cathodes de cuivre",
     "L'identité du prêteur n'est pas lisible dans le document source ; reproduit tel quel, sans supposer une identité.", "GÉCAMINES, section 6.2"],
    ["GÉCAMINES", "CDM", 5000000.0, 2448424.04, "0 %", "Compensation de castine", "", "GÉCAMINES, section 6.2"],
    ["GÉCAMINES", "TFM", 30000000.0, 78187784.0, "6 %", "Garantie sur les dividendes de GÉCAMINES dans la JV",
     "L'accroissement du stock (30 000 000 → 78 187 784) doit être rapproché des intérêts courus et écritures de change.", "GÉCAMINES, section 6.2"],
    ["GÉCAMINES", "Total source (4 lignes)", 66514593.0, 118663702.04, "", "", "Total documenté ; conciliation officielle nécessaire, en particulier pour TFM et Krill Ventures.", "GÉCAMINES, section 6.2"],
    ["SCMK-Mn", "Taurian (Taurian Manganese de Kisenge)", 1994200.0, None, "Non disponible", "Non disponible",
     "Ni date, ni taux, ni échéancier, ni solde fin 2024, ni garantie ne sont fournis par SCMK-Mn pour ce prêt.", "SCMK-Mn, section 5.3 / 6.2"],
    ["SOKIMO", "Non individualisé (garantie par la quote-part de production des JV)", None, None, "Non disponible",
     "Quote-part de production dans les JV en garantie du remboursement des prêts reçus",
     "SOKIMO indique que sa quote-part de production dans les partenariats garantit le remboursement des prêts reçus, sans fournir par prêt le principal, le taux, la durée ni le solde.", "SOKIMO, section 5.1"],
    ["COMINIERE", "Aucun prêteur", None, None, "Sans objet", "Sans objet", "COMINIERE déclare n'avoir reçu aucun emprunt.", "COMINIERE, section 4.5"],
]
add(
    "ent_emprunts_recus",
    "Emprunts reçus par les entreprises publiques — situation fin 2024",
    "Entrepôt consolidé 2022-2024",
    "Emprunts reçus par les entreprises publiques du secteur extractif auprès de tiers, avec montant reçu, "
    "stock restant dû fin 2024, taux et garanties connues. Répond à l'Exigence ITIE 2.6 (prêts et garanties).",
    cols_er, types_er, rows_er,
    periode="jusqu'à fin 2024",
    unite="USD",
    qualite=(
        "L'identité du prêteur d'une ligne GÉCAMINES (11 514 593 USD reçus) est illisible dans le document "
        "source et reproduite comme telle plutôt que devinée. Les conditions complètes (date, échéancier, "
        "sûretés) manquent pour le prêt SCMK-Mn/Taurian et pour les prêts garantis par la production chez "
        "SOKIMO — signalé en Priorité 2 des lacunes (section 10 de la note source)."
    ),
)

# ---------------------------------------------------------------------------
# 6) Avances fiscales et prêts à l'État (GÉCAMINES) — Exigence 6.2
# ---------------------------------------------------------------------------
cols_af = ["Nature", "Montants payés (USD)", "Compensés / remboursés (USD)", "Solde (USD)", "Observation", "Source"]
types_af = ["str", "num", "num", "num", "str", "str"]
rows_af = [
    ["DGI", 490371863.00, 268903572.46, 221468290.54, "", "GÉCAMINES, tableau au 23 juillet 2025 (section 7.1)"],
    ["DGRAD", 192750000.00, 25456223.37, 167293776.63, "", "GÉCAMINES, tableau au 23 juillet 2025 (section 7.1)"],
    ["DGDA", 60750000.00, 3291998.63, 57458001.37, "", "GÉCAMINES, tableau au 23 juillet 2025 (section 7.1)"],
    ["Non titrisé", 8000000.00, 0.0, 8000000.00, "", "GÉCAMINES, tableau au 23 juillet 2025 (section 7.1)"],
    ["Prêts à l'État", 333000000.00, 9000000.00, 324000000.00, "", "GÉCAMINES, tableau au 23 juillet 2025 (section 7.1)"],
    ["Sous-total source (5 lignes ci-dessus)", 1084871863.00, 306651794.46, 778220068.54, "Sous-total arithmétiquement cohérent avec les 5 lignes précédentes.", "GÉCAMINES, tableau au 23 juillet 2025 (section 7.1)"],
    ["Créance de TVA certifiée (ajoutée séparément)", 10241737.61, None, None, "Ajoutée au sous-total dans le document sans que la méthode d'addition soit explicite.", "GÉCAMINES, section 7.1"],
    ["Total imprimé dans le document (non réconcilié)", 1417871863.00, 315651794.46, 788461806.15,
     "Ce total, ces compensations et ce solde, tels qu'imprimés dans le document source, ne se réconcilient "
     "NI entre eux NI avec le sous-total des 5 lignes détaillées ci-dessus. La créance TVA et les prêts "
     "semblent avoir été additionnés de manière incohérente. Reproduit tel quel — aucune valeur « corrigée » "
     "n'est calculée ici. Une conciliation officielle par écriture, entreprise par entreprise, est indispensable.",
     "GÉCAMINES, section 7.1"],
    ["Mouvement 2024 — avance fiscale DGI", 50000000.00, None, None, "Datée du 8 mai 2024.", "GÉCAMINES, section 7.1"],
    ["Mouvement 2024 — avance fiscale DGI", 100000000.00, None, None, "Datée du 20 mai 2024.", "GÉCAMINES, section 7.1"],
    ["Mouvement 2024 — avance DGRAD", 50000000.00, None, None, "Datée du 8 octobre 2024.", "GÉCAMINES, section 7.1"],
    ["Mouvement 2024 — prêt à l'État", None, None, None, "Daté du 17 juin 2024 ; montant illisible sur la pièce transmise — non deviné.", "GÉCAMINES, section 7.1"],
]
add(
    "ent_avances_fiscales_prets_etat",
    "Avances fiscales et prêts à l'État de GÉCAMINES par régie — Exigence 6.2",
    "Entrepôt consolidé 2022-2024",
    "Avances fiscales consenties par GÉCAMINES aux régies financières (DGI, DGRAD, DGDA) et prêts consentis à "
    "l'État, montants payés, compensations/remboursements et soldes, tels que déclarés par GÉCAMINES au 23 "
    "juillet 2025, avec les mouvements 2024 explicitement identifiés dans la pièce.",
    cols_af, types_af, rows_af,
    periode="jusqu'au 23 juillet 2025 (mouvements 2024 identifiés séparément)",
    unite="USD",
    desagregation="régie / nature",
    qualite=(
        "Plus d'1 milliard USD d'avances fiscales, prêts et créances déclarés par GÉCAMINES ne sont PAS "
        "réconciliés dans le document source : le total, les compensations et le solde imprimés par GÉCAMINES "
        "ne correspondent ni entre eux ni au sous-total des lignes détaillées par régie (voir la ligne « Total "
        "imprimé dans le document » ci-dessus, conservée telle quelle). Le montant du prêt à l'État du 17 juin "
        "2024 est illisible sur la pièce transmise et n'a pas été deviné. Une conciliation officielle par "
        "écriture est indispensable (Priorité 1 des lacunes identifiées, section 10 de la note source)."
    ),
)

# ---------------------------------------------------------------------------
# 7) Subventions reçues de l'État par les entreprises publiques
# ---------------------------------------------------------------------------
cols_sub = ["Entreprise publique", "Exercice", "Nature de la subvention", "Montant", "Devise", "Observation", "Source"]
types_sub = ["str", "num", "str", "num", "str", "str", "str"]
rows_sub = [
    ["SAKIMA", 2024, "Subvention d'exploitation (2e tranche, lancement petite mine de Walikale)", 525126.0, "USD",
     "Démarches engagées en 2023 ; deuxième tranche obtenue en 2024. Une donnée distincte pour le même type de "
     "subvention en 2023 indique 535 790 USD dans le Rapport de Validation ITIE — divergence entre les deux "
     "sources non résolue ici (voir ligne 2023 ci-dessous et meta.qualite).", "SAKIMA, section 4.4"],
    ["SAKIMA", 2023, "Subvention d'équipement (réhabilitation centrale de Lutshurukuru)", 1330000.0, "USD", "", "SAKIMA, section 4.6"],
    ["SAKIMA", 2023, "Subvention d'exploitation (lancement petite mine de Walikale)", 535790.0, "USD",
     "Ce montant (535 790 USD, exercice 2023) provient du Rapport de Validation ITIE cité en section 1 de la "
     "note source, tandis que la pièce SAKIMA elle-même documente 525 126 USD comme deuxième tranche pour "
     "2024 (voir ligne 2024 ci-dessus). Les deux chiffres concernent le même dispositif de subvention "
     "d'exploitation pour la petite mine de Walikale mais ne sont pas identiques ; aucune valeur unique n'est "
     "retenue ici — les deux sont conservées telles quelles dans l'attente d'un rapprochement officiel.",
     "Rapport de Validation ITIE-RDC / SAKIMA, section 4.6"],
    ["SAKIMA", 2024, "Ventes d'électricité à la SNEL (non une subvention reçue, mais recette liée à la fourniture d'électricité — quasi budgétaire, voir ent_depenses_quasi_budgetaires_sociales)", 18962.0, "USD", "Deux montants distincts déclarés : 18 962 et 21 539 USD.", "SAKIMA, section 4.4"],
    ["SAKIMA", 2024, "Ventes d'électricité à la SNEL", 21539.0, "USD", "", "SAKIMA, section 4.4"],
    ["COMINIERE", 2024, "Subvention reçue de l'État", None, None, "COMINIERE déclare n'avoir jamais reçu de subvention.", "COMINIERE, section 4.5 / 7.2"],
    ["SOKIMO", 2024, "Subvention reçue de l'État", None, None, "Non documentée dans les pièces transmises (absence de donnée, distincte d'une déclaration explicite de « néant »).", "SOKIMO, section 7.2"],
    ["SCMK-Mn", 2024, "Subvention reçue de l'État", None, None, "Non documentée dans les pièces transmises (absence de donnée, distincte d'une déclaration explicite de « néant »).", "SCMK-Mn, section 7.2"],
    ["GÉCAMINES", 2024, "Subvention reçue de l'État", None, None, "Non documentée comme telle dans les pièces transmises ; GÉCAMINES documente en revanche des avances fiscales et prêts À l'État (voir ent_avances_fiscales_prets_etat), de nature différente.", "GÉCAMINES, section 7"],
]
add(
    "ent_subventions_recues",
    "Subventions reçues de l'État par les entreprises publiques — 2023-2024",
    "Entrepôt consolidé 2022-2024",
    "Subventions d'exploitation et d'équipement déclarées par les entreprises publiques du secteur extractif, "
    "avec la divergence de montant SAKIMA signalée explicitement plutôt que corrigée. Répond à l'Exigence ITIE "
    "6.2 (dépenses quasi budgétaires).",
    cols_sub, types_sub, rows_sub,
    periode="2023-2024",
    unite="USD",
    qualite=(
        "Divergence non résolue : la subvention d'exploitation SAKIMA pour la petite mine de Walikale est "
        "chiffrée à 525 126 USD (deuxième tranche, exercice 2024, pièce SAKIMA) et à 535 790 USD (exercice "
        "2023, Rapport de Validation ITIE cité en introduction de la note source). Il pourrait s'agir de deux "
        "tranches différentes du même dispositif ou d'une divergence de source — un rapprochement avec les "
        "comptes publics est nécessaire avant toute consolidation. Pour SOKIMO, SCMK-Mn et GÉCAMINES, "
        "l'absence de donnée ne doit pas être interprétée comme une déclaration de « néant » : seule COMINIERE "
        "a explicitement déclaré n'avoir jamais reçu de subvention."
    ),
)

# ---------------------------------------------------------------------------
# 8) Participations et partenariats (JV) consolidés par entreprise publique
# ---------------------------------------------------------------------------
cols_jv = ["Entreprise d'État", "Partenariat / JV", "Participation EP", "Participation partenaire(s) / État", "Titres", "Substance / Localisation", "Phase (fin 2024 / début 2025)", "Observation", "Source"]
types_jv = ["str", "str", "num", "str", "str", "str", "str", "str", "str"]
rows_jv = [
    # SOKIMO (7 JV, section 5.1)
    ["SOKIMO", "Kibali Gold Mines", 10.0, "Barrick 45 %, AngloGold Ashanti 45 %", "10 PE : 11447, 11467-11472, 5052, 5073, 5088", "Or/argent, Watsa, Haut-Uélé", "Production", "", "SOKIMO, section 5.1"],
    ["SOKIMO", "Giro Gold Fields", 35.0, "Amani Consulting 65 %", "PE 5046, 5049, 5110", "Or/argent, Watsa et extension Ituri", "Étude de faisabilité approuvée en mars 2025 ; transformation en contrat de cession en cours", "", "SOKIMO, section 5.1"],
    ["SOKIMO", "Mongbwalu Gold Mine", 13.78, "FIMOSA 86,22 %", "11 PE", "Or/argent, Djugu, Ituri", "Force majeure levée ; cession projetée de quatre PE à SHARI", "", "SOKIMO, section 5.1"],
    ["SOKIMO", "Société minière de Moku", 35.0, "Moku Gold Mines 65 %", "6 PE", "Or/argent, Watsa", "Discussion sur la levée de la force majeure", "", "SOKIMO, section 5.1"],
    ["SOKIMO", "Wanga Mining", 35.0, "Partenaire 65 %", "5 PE", "Or/argent, Watsa", "Renouvellement des titres", "", "SOKIMO, section 5.1"],
    ["SOKIMO", "Kodo Resources", 30.0, "Partenaire 70 %", "PE 5078, 5079, 5081", "Or/argent, Aru, Ituri", "Jamais démarré, manque de financement", "Substitution de MIL Invest à AMIRAC en cours.", "SOKIMO, section 5.1"],
    ["SOKIMO", "Djugu-Watsa Mining", 30.0, "Technobuild 70 %", "6 PE", "Or/argent, Djugu/Watsa", "Jamais démarré ; régularisation CAMI attendue", "", "SOKIMO, section 5.1"],
    # SAKIMA (6 JV à capital + partenaires en amodiation/négociation, section 5.2)
    ["SAKIMA", "Punia Kasese Mining", 30.0, "DOTT 70 % (capital JV 100 000 USD)", "Non précisé", "Maniema/Nord-Kivu/Sud-Kivu (étain, niobium, tantale, tungstène, or, argent, monazite)", "Actualisation/certification des réserves, réhabilitation des accès", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "Kalima Mining Company", 30.0, "STONE 70 % (capital JV 100 000 USD)", "Non précisé", "Maniema/Nord-Kivu/Sud-Kivu", "Production commerciale depuis 2024", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "Congo Fer Mining", 30.0, "CDMC 70 % (capital JV 100 000 USD)", "Non précisé", "Maniema/Nord-Kivu/Sud-Kivu", "Force majeure", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "Solia", 30.0, "METACHEM 70 % (capital JV 100 000 USD)", "Non précisé", "Maniema/Nord-Kivu/Sud-Kivu", "Non précisée", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "Kalehe", 30.0, "AMUR 70 % (capital JV 50 000 USD)", "Non précisé", "Maniema/Nord-Kivu/Sud-Kivu", "Force majeure", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "Kibara Rare Earths", 30.0, "KIBARA 70 % (capital JV 20 000 USD)", "Non précisé", "Maniema/Nord-Kivu/Sud-Kivu", "Force majeure", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "STAR TECH", None, "Non précisé", "Non précisé", "Non précisé", "Contrat de JV d'octobre 2024 jamais exécuté", "Procédure de résiliation en cours.", "SAKIMA, section 5.2"],
    ["SAKIMA", "PRIMERA", None, "Non précisé", "Non précisé", "Non précisé", "Contrat de juillet 2023 jamais exécuté", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "B.G. Mining (en négociation)", None, "Non précisé", "PE 69, 2609, 2610", "Non précisé", "En négociation", "", "SAKIMA, section 5.2"],
    ["SAKIMA", "Planet One (en négociation)", None, "Non précisé", "PE 75", "Non précisé", "En négociation", "", "SAKIMA, section 5.2"],
    # SCMK-Mn (2 JV, section 5.3)
    ["SCMK-Mn", "Société Congolaise de Manganèse (SCM SA) / Taurian Manganese de Kisenge", 25.0, "TMK 65 %, État 10 %", "PE 32, 15646, 15647 (manganèse)", "Kisenge, Dilolo, Lualaba", "Installation, non opérationnelle", "JV constituée le 3 novembre 2023.", "SCMK-Mn, section 5.3"],
    ["SCMK-Mn", "Mpokoto Ressources Company (MRC) / Blue Sky Mining", 20.0, "BSM 70 %, État 10 %", "PE 13122-13125 (or)", "Mpokoto, Dilolo, Lualaba", "Installation, non opérationnelle", "JV constituée le 17 septembre 2024.", "SCMK-Mn, section 5.3"],
    # COMINIERE (~11 participations, section 5.4)
    ["COMINIERE", "MINOCOM", 30.0, "", "Non précisé", "Non précisé", "Non précisé", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "TaNbGANIKA", 32.0, "", "Non précisé", "Non précisé", "Non précisé", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "SOMIMI", 30.0, "", "Non précisé", "Non précisé", "Non précisé",
     "Divergence : la réponse antérieure de COMINIERE indique SOMIMI à 32 %, contre 30 % dans la réponse la "
     "plus récente (reproduite ici). Divergence non résolue ; à trancher par les statuts, le registre des "
     "titres et les décisions d'assemblée.", "COMINIERE, section 5.4"],
    ["COMINIERE", "Murumbi Mineral", 15.0, "", "Non précisé", "Non précisé", "Non précisé", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "UATT", 32.0, "", "Non précisé", "Non précisé", "Non précisé", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "DATHCOM", 25.0, "", "Non précisé", "Non précisé", "Non précisé", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "Hong Mining DA", 30.0, "", "Non précisé", "Non précisé", "En 2025", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "United COMINIERE", 30.0, "", "Non précisé", "Non précisé", "En 2024", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "Katamba Mining", 30.0, "", "Non précisé", "Non précisé", "Non précisé", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "Manono Lithium", 39.0, "dont 3,9 % cédés et 35,1 % revenant à l'État en 2025 selon le tableau", "Non précisé", "Non précisé", "2024 ; évolution vers 2025",
     "Base juridique et contrepartie de la cession de 3,9 % non renseignées dans les pièces reçues.", "COMINIERE, section 5.4"],
    ["COMINIERE", "SEGMAL", 32.0, "", "Non précisé", "Non précisé", "Non précisé", "", "COMINIERE, section 5.4"],
    ["COMINIERE", "COMINIERE/CHEMAF", None, "", "Non précisé", "Non précisé", "Non précisé", "Aucun pourcentage de participation fourni dans les pièces reçues.", "COMINIERE, section 5.4"],
    ["COMINIERE", "Lotus", None, "", "Non précisé", "Non précisé", "Non précisé", "Aucun pourcentage de participation fourni dans les pièces reçues.", "COMINIERE, section 5.4"],
    # GÉCAMINES (splits de parts, section 5.5) — GÉCAMINES / autres partenaires / État congolais
    ["GÉCAMINES", "Boss Mining", 49.0, "Partenaire(s) 51 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "COMIKA", 30.0, "Partenaire(s) 65 %, État congolais 5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "COMILU", 28.0, "Partenaire(s) 67 %, État congolais 5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "COMMUS", 28.0, "Partenaire(s) 67 %, État congolais 5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "GCK", 20.0, "Partenaire(s) 80 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "Kambove Mining", 40.0, "Partenaire(s) 55 %, État congolais 5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "KCC (Kamoto Copper Corporation)", 25.0, "Partenaire(s) 75 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "KICO", 32.0, "Partenaire(s) 68 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "MKM", 19.8, "Partenaire(s) 75,2 %, État congolais 5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "Ruashi Mining", 25.0, "Partenaire(s) 70 %, État congolais 5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "SICOMINES", 32.0, "Partenaire(s) 68 %", "Non précisé", "Cuivre-cobalt (troc infrastructures)", "Production (majorité des grandes JV cuivre-cobalt)", "Voir aussi le thème « Troc / SICOMINES » du site pour le détail des contreparties infrastructures.", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "SMCO", 27.5, "Partenaire(s) 72,5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "SOMIDEZ", 44.0, "Partenaire(s) 51 %, État congolais 5 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
    ["GÉCAMINES", "TFM", 20.0, "Partenaire(s) 80 %", "Non précisé", "Cuivre-cobalt", "Production (majorité des grandes JV cuivre-cobalt)", "", "GÉCAMINES, section 5.5"],
]
add(
    "ent_participations_jv",
    "Participations et partenariats (JV) des entreprises publiques — situation fin 2024/2025",
    "Entrepôt consolidé 2022-2024",
    "Base consolidée des partenariats et coentreprises (JV) de GÉCAMINES, SAKIMA, SOKIMO, COMINIERE et "
    "SCMK-Mn : partenaire, part de l'entreprise publique et du/des partenaire(s) (et de l'État congolais le "
    "cas échéant), titres miniers, substance/localisation et phase, avec les divergences de participation "
    "signalées explicitement (ex. SOMIMI/COMINIERE 30 %/32 %). Répond à l'Exigence ITIE 2.6.",
    cols_jv, types_jv, rows_jv,
    periode="fin 2024 / début 2025",
    unite="pourcentage de participation",
    desagregation="entreprise d'État, partenariat",
    qualite=(
        "GÉCAMINES ne fournit pas de table explicite des variations de participation en 2024 ; les parts "
        "GÉCAMINES/partenaires/État listées ici (section 5.5 de la note source) documentent la structure de "
        "capital telle que rapportée, pas nécessairement une évolution récente. COMINIERE présente une "
        "divergence non résolue sur sa participation dans SOMIMI (30 % contre 32 % selon la pièce). Pour "
        "plusieurs participations COMINIERE (COMINIERE/CHEMAF, Lotus) et SAKIMA (contrats en négociation), "
        "aucun pourcentage n'est disponible dans les pièces reçues — la cellule est laissée vide plutôt que "
        "supposée. Aucune modification de participation n'est déclarée par SOKIMO ni SAKIMA en 2024 ; SCMK-Mn "
        "a constitué une nouvelle JV (MRC) en 2024 ; COMINIERE décrit plusieurs réattributions de partenaires "
        "et transformations de permis en cours de restructuration/liquidation, non détaillées ligne par ligne."
    ),
)

# ---------------------------------------------------------------------------
# 9) Revenus en nature de l'État — Exigence 4.2
# ---------------------------------------------------------------------------
cols_nat = ["Entreprise publique", "Exercice", "Revenu en nature déclaré", "Statut", "Observation", "Source"]
types_nat = ["str", "num", "str", "str", "str", "str"]
rows_nat = [
    ["SOKIMO", 2024, "Quote-part de production alluvionnaire (Giro Gold Fields)", "Déclarée en valeur monétaire (442 790 USD), non en volume physique",
     "Ne constitue pas, en l'état, une preuve de revenu en nature au sens de l'Exigence 4.2 : aucun volume, date, qualité ou entité vendeuse n'est précisé.", "SOKIMO, section 8"],
    ["GÉCAMINES", 2024, "Aucun volume physique de minerai déclaré comme reçu par l'État ou une entreprise d'État", "Non confirmé formellement (« néant » non signé)",
     "Contrats historiquement cités par le Rapport de Validation comme non producteurs de revenus en nature : Kinga Kila/HKEMI-GÉCAMINES.", "Note de synthèse, section 8"],
    ["SOKIMO", 2024, "Aucun volume physique de minerai déclaré comme reçu par l'État ou une entreprise d'État", "Non confirmé formellement (« néant » non signé)",
     "Contrat historiquement cité par le Rapport de Validation comme non producteur de revenus en nature : SOKIMO/KORKHA.", "Note de synthèse, section 8"],
    ["SAKIMA", 2024, "Aucun revenu en nature identifié dans les pièces reçues", "Non confirmé formellement (« néant » non signé)", "", "Note de synthèse, section 8"],
    ["COMINIERE", 2024, "Aucun revenu en nature identifié dans les pièces reçues", "Non confirmé formellement (« néant » non signé)", "", "Note de synthèse, section 8"],
    ["SCMK-Mn", 2024, "Aucun revenu en nature identifié dans les pièces reçues", "Non confirmé formellement (« néant » non signé)", "", "Note de synthèse, section 8"],
]
add(
    "ent_revenus_nature",
    "Revenus en nature de l'État et des entreprises publiques — Exigence 4.2 (2024)",
    "Entrepôt consolidé 2022-2024",
    "Statut, pour chaque entreprise publique, de la réception éventuelle d'un volume physique de pétrole, gaz "
    "ou minerai en 2024 (clauses de partage de production ou règlement en nature). Aucune pièce ne prouve la "
    "réception d'un tel volume en 2024 ; une confirmation formelle « néant », signée par chaque entreprise, "
    "reste nécessaire plutôt qu'une simple absence de donnée.",
    cols_nat, types_nat, rows_nat,
    periode="2024",
    unite="n/a (statut déclaratif)",
    qualite=(
        "L'Exigence 4.2 est qualifiée de « sans objet » par le Rapport de Validation, mais la note source "
        "souligne qu'une absence de donnée n'équivaut pas à une confirmation formelle « néant » signée. "
        "Priorité 5 des lacunes identifiées (section 10) : obtenir des déclarations « néant » ou complètes "
        "pour 2024 et instaurer un formulaire permanent avant l'entrée en production de tout contrat de partage."
    ),
)

# ---------------------------------------------------------------------------
# 10) Dépenses quasi budgétaires et sociales
# ---------------------------------------------------------------------------
cols_qb = ["Entreprise publique", "Activité", "Détail", "Bénéficiaires", "Montant / coût 2024", "Observation", "Source"]
types_qb = ["str", "str", "str", "str", "num", "str", "str"]
rows_qb = [
    ["GÉCAMINES", "Éducation / formation professionnelle", "23 centres, lycées ou instituts professionnels dans le Haut-Katanga, le Lualaba et le Haut-Lomami",
     "2 061 apprenants et 275 encadreurs (2025-2026)", None,
     "Coûts 2024, sources de financement, recettes éventuelles et bénéficiaires externes non fournis dans les pièces reçues. Sans ces montants, le niveau de transparence attendu par l'Exigence 6.2 n'est pas atteint pour ces services.",
     "GÉCAMINES, section 7.3"],
    ["SAKIMA", "Fourniture d'électricité", "Fourniture d'électricité à Kindu via la centrale de Lutshurukuru, réhabilitée par AEC",
     "Population/usagers de Kindu", None,
     "Mandat de service public, coûts complets, bénéficiaires, financement et traitement budgétaire à évaluer sous l'angle des dépenses quasi budgétaires (Exigence 6.2). Voir aussi la subvention d'équipement de 1 330 000 USD (2023) pour la réhabilitation de cette centrale, dans ent_subventions_recues.",
     "SAKIMA, section 4.4 / 7.2"],
    ["GÉCAMINES", "Avances fiscales et prêts à l'État", "Voir le détail complet par régie dans ent_avances_fiscales_prets_etat", "État congolais (via DGI, DGRAD, DGDA) et Trésor",
     778220068.54,
     "Solde du sous-total documenté par régie (hors le total non réconcilié imprimé par GÉCAMINES — voir ent_avances_fiscales_prets_etat).",
     "GÉCAMINES, section 7.1"],
]
add(
    "ent_depenses_quasi_budgetaires_sociales",
    "Dépenses quasi budgétaires et sociales des entreprises publiques — Exigence 6.2",
    "Entrepôt consolidé 2022-2024",
    "Activités des entreprises publiques assimilables à des dépenses quasi budgétaires ou sociales (éducation, "
    "électricité, avances fiscales et prêts à l'État), avec mention explicite des données manquantes (coûts "
    "complets, mandat de service public, mécanisme d'approbation) empêchant une divulgation complète au sens "
    "de l'Exigence ITIE 6.2.",
    cols_qb, types_qb, rows_qb,
    periode="2024-2025 (activités identifiées ; chiffrage 2024 largement manquant)",
    unite="USD lorsque disponible",
    qualite=(
        "Pour les activités sociales et de fourniture de services (centres de formation GÉCAMINES, électricité "
        "SAKIMA à Kindu), les coûts complets 2024, le mandat de service public, le mécanisme d'approbation et "
        "le traitement budgétaire ne sont pas fournis dans les pièces reçues — seule l'existence de l'activité "
        "est documentée. Priorité 3 des lacunes identifiées (section 10 de la note source)."
    ),
)

# ---------------------------------------------------------------------------
# 11) Investissements engagés par les entreprises publiques et leurs JV
# ---------------------------------------------------------------------------
cols_inv = ["Entreprise / JV", "Exercice", "Indicateur", "Montant (USD)", "Observation", "Source"]
types_inv = ["str", "num", "str", "num", "str", "str"]
rows_inv = [
    ["GÉCAMINES", 2024, "Prévisions d'investissement", 48203982.48, "", "GÉCAMINES, section 9"],
    ["GÉCAMINES", 2024, "Engagements d'investissement", 18827264.09, "", "GÉCAMINES, section 9"],
    ["GÉCAMINES", 2024, "Décaissements d'investissement", 13691781.12, "Principales catégories : sondage/prospection, informatique/logiciels, engins, matériels roulants et autres matériels.", "GÉCAMINES, section 9"],
    ["SOKIMO / Kibali Gold Mines", 2024, "Investissements engagés", 381173441.0, "", "SOKIMO, section 4.3 / 9"],
    ["SOKIMO / Kibali Gold Mines", 2024, "Ventilation par nature des investissements (total)", 219048790.0,
     "Écart avec les investissements engagés (381 173 441) non expliqué par la pièce. Détail : recherche/prospection 7 023 150 ; bâtiments 19 158 833 ; aménagements/installations 124 992 846 ; matériel/mobilier/actifs biologiques 54 549 636 ; matériel de transport 13 324 325.",
     "SOKIMO, section 4.3 / 9"],
    ["SOKIMO / Kibali Gold Mines", 2024, "Sous-traitance (dépenses)", 104726809.0, "Liste des sous-traitants non fournie.", "SOKIMO, section 4.3"],
    ["SOKIMO / Kibali Gold Mines", 2023, "Investissements engagés", 176320362.0, "À concilier avec la ligne « nature des investissements » 2023 ci-dessous.", "SOKIMO, section 9"],
    ["SOKIMO / Kibali Gold Mines", 2023, "Ventilation par nature des investissements (total)", 280563611.0,
     "Le total affiché (280 563 611) diffère de la somme arithmétique des cinq rubriques détaillées (280 563 610, écart de 1 USD probablement d'arrondi) et surtout de l'« investissements engagés » (176 320 362) — ces trois chiffres doivent être conciliés par SOKIMO.",
     "SOKIMO, section 4.3 / 9"],
    ["SOKIMO / Kibali Gold Mines", 2023, "Dépenses de sous-traitance", 112465143.0, "", "SOKIMO, section 4.3"],
    ["COMINIERE", 2023, "Investissement déclaré", 3591226.0, "Appartement à Kinshasa, terrain à Luano, camp et bureau à Mitwaba.", "COMINIERE, section 4.6"],
    ["COMINIERE", 2024, "Investissement déclaré (acquisition d'engins, Mitwaba)", 3304280.0, "", "COMINIERE, section 4.5"],
    ["SCMK-Mn", 2024, "Niveau d'investissement", None, "Indiqué « non connu » par SCMK-Mn.", "SCMK-Mn, section 9"],
    ["SAKIMA", 2024, "Tableau consolidé des investissements", None, "Informations opérationnelles fournies par SAKIMA, mais pas de tableau consolidé des investissements 2024.", "SAKIMA, section 9"],
]
add(
    "ent_investissements_engages",
    "Investissements engagés par les entreprises publiques et leurs partenariats — 2023-2024",
    "Entrepôt consolidé 2022-2024",
    "Prévisions, engagements et décaissements d'investissement déclarés par les entreprises publiques et "
    "leurs principales JV, avec les écarts internes aux pièces sources signalés explicitement (notamment la "
    "triple incohérence SOKIMO/Kibali entre investissements engagés, ventilation par nature et sous-traitance).",
    cols_inv, types_inv, rows_inv,
    periode="2023-2024",
    unite="USD",
    qualite=(
        "Les montants d'investissement de Kibali Gold Mines (JV SOKIMO) présentent des écarts internes non "
        "expliqués par la pièce, aussi bien en 2023 (176,3 M vs 280,6 M USD) qu'en 2024 (381,2 M vs 219,0 M "
        "USD de ventilation par nature) ; les trois chiffres par exercice doivent être conciliés par SOKIMO. "
        "Aucun tableau consolidé n'est disponible pour SAKIMA ; le niveau d'investissement de SCMK-Mn est "
        "explicitement indiqué comme inconnu par l'entreprise elle-même."
    ),
)

# ---------------------------------------------------------------------------
# 12) Couverture des exigences ITIE et lacunes prioritaires (méta-transparence)
# ---------------------------------------------------------------------------
cols_cov = ["Exigence ITIE", "Élément attendu", "Données disponibles dans les pièces", "État de couverture", "Source"]
types_cov = ["str", "str", "str", "str", "str"]
rows_cov = [
    ["2.6 / 4.5", "Liste des entreprises d'État et participations", "GÉCAMINES, SAKIMA, SOKIMO, SCMK-Mn et COMINIERE fournissent des listes de partenariats, titres et participations", "Couverture substantielle, mais formats non harmonisés entre entreprises", "Note de synthèse, section 3"],
    ["2.6", "Modifications de participations en 2024", "SOKIMO : aucune ; SAKIMA : aucune modification de structure du capital ; COMINIERE : changements décrits ; SCMK-Mn : nouvelle JV MRC en 2024", "Couvert partiellement ; GÉCAMINES ne fournit pas une table explicite des variations", "Note de synthèse, section 3"],
    ["2.6", "Prêts accordés et conditions", "GÉCAMINES fournit bénéficiaires, montants, stocks, taux et certaines modalités ; SOKIMO, SCMK-Mn et COMINIERE déclarent n'avoir accordé aucun prêt", "Couvert, sauf dates/modalités manquantes pour plusieurs prêts GÉCAMINES et absence d'information SAKIMA", "Note de synthèse, section 3"],
    ["2.6", "Emprunts reçus et garanties", "GÉCAMINES fournit quatre lignes et les garanties ; SOKIMO indique que sa quote-part de production garantit les prêts ; SCMK-Mn mentionne un prêt reçu de 1 994 200 USD ; COMINIERE déclare n'avoir reçu aucun emprunt", "Couvert partiellement ; détails incomplets pour SCMK-Mn et SOKIMO", "Note de synthèse, section 3"],
    ["4.5", "Recettes des partenariats 2022-2024", "Séries disponibles pour SAKIMA ; points de comparaison 2022/2024 pour GÉCAMINES et 2023/2024 pour SOKIMO ; 2024 pour COMINIERE", "Couverture améliorée, mais série annuelle incomplète pour GÉCAMINES et COMINIERE", "Note de synthèse, section 3"],
    ["4.5 / 6.2", "Paiements/transferts à l'État", "SAKIMA détaille impôts et contribution budgétaire ; GÉCAMINES détaille avances fiscales et prêts à l'État", "Couvert partiellement ; paiements ordinaires des autres entreprises absents", "Note de synthèse, section 3"],
    ["6.2", "Subventions de l'État", "SAKIMA déclare une subvention d'exploitation (525 126 USD en 2024, 535 790 USD en 2023 selon le Rapport de Validation) ; COMINIERE déclare n'en avoir jamais reçu", "Donnée importante à rapprocher avec les comptes publics ; autres entreprises non documentées", "Note de synthèse, section 3"],
    ["6.2", "Dépenses quasi budgétaires et sociales", "GÉCAMINES décrit 23 centres de formation ; SAKIMA fournit de l'électricité à Kindu ; avances fiscales et prêts de GÉCAMINES documentés", "Activités identifiées, mais coûts, bénéficiaires, mandat budgétaire et mécanisme d'approbation manquent", "Note de synthèse, section 3"],
    ["4.2", "Revenus en nature", "Aucun revenu en nature explicitement déclaré ; SOKIMO perçoit une quote-part monétaire de production alluvionnaire", "Il faut confirmer formellement qu'aucun volume physique n'a été reçu/vendu en 2024", "Note de synthèse, section 3"],
    ["2.6 / 6.2", "États financiers audités", "COMINIERE indique que des états certifiés sont annexés, mais ils ne figurent pas dans le corpus ; aucune autre annexe auditée fournie", "Non couvert par les pièces reçues", "Note de synthèse, section 3"],
    ["2.2 / 2.6", "Publication des contrats", "SOKIMO indique une publication sur les sites CTCPM et ITIE ; aucune preuve/lien par contrat dans le corpus", "À vérifier et documenter", "Note de synthèse, section 3"],
    ["2.6", "Lutte contre la corruption", "Informations fournies par les cinq entreprises à des degrés variables (manuels de procédures, audits internes, contrôles)", "Couvert descriptivement, sans preuve d'efficacité (alertes, enquêtes, sanctions, déclarations de conflits d'intérêts)", "Note de synthèse, section 9"],
]
add(
    "ent_couverture_exigences_2_6",
    "Couverture des Exigences ITIE 2.6 / 4.2 / 4.5 / 6.2 — état et lacunes",
    "Entrepôt consolidé 2022-2024",
    "Grille de couverture, élément par élément, des Exigences ITIE relatives à la participation de l'État "
    "(2.6), à la vente des revenus en nature (4.2), aux transactions liées aux entreprises d'État (4.5) et aux "
    "dépenses quasi budgétaires (6.2), reprenant l'appréciation du Rapport de Validation ITIE-RDC ("
    "respectivement « en grande partie respectée », « sans objet », « pleinement respectée » et « en grande "
    "partie respectée ») et les données désormais disponibles grâce aux pièces transmises par les cinq "
    "entreprises publiques.",
    cols_cov, types_cov, rows_cov,
    periode="2022-2024",
    unite="n/a (grille qualitative)",
    qualite=(
        "Cette table reprend telles quelles les appréciations et lacunes formulées par le Rapport de "
        "Validation ITIE-RDC et par la note de synthèse ; elle ne prétend pas clore ces lacunes mais les rendre "
        "visibles publiquement. Les mesures correctives attendues par le Rapport de Validation sont : divulguer "
        "les conditions complètes des prêts et garanties, systématiser la revue de la participation de l'État, "
        "publier régulièrement les états financiers audités, prévoir un mécanisme de déclaration des futurs "
        "revenus en nature et instaurer une déclaration complète des dépenses quasi budgétaires, y compris "
        "celles des filiales et partenariats."
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
