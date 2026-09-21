#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enrichit la Vue d'ensemble (et la rubrique « Rapports, sources et
méthodologie ») à partir de deux classeurs d'analyse BI fournis directement
par l'utilisateur le 2026-09-21 :

  - Base_BI_Rapports_ITIE_RDC_2007-2023.xlsx : base consolidée couvrant les
    17 rapports annuels ITIE-RDC (2007 à 2023) et 9 rapports thématiques +
    la modélisation fiscale. Feuilles utilisées ici : « Série annuelle »
    (série longue 2007-2023, avec sa hiérarchie de sources et ses
    avertissements de comparabilité) et « Thématiques » (résumé quantifié
    des 9 études transversales). Les feuilles « Agences », « Top
    entreprises » et « Flux » ne sont PAS reprises ici : elles dérivent des
    mêmes données déjà publiées à un niveau plus fin dans l'entrepôt
    (ent_revenus_entite, ent_revenus_entreprise, fait_reconciliation_flux),
    et les dupliquer créerait un risque de confusion entre deux agrégats
    censés être identiques.
  - Analyse_BI_ITIE_RDC 1.xlsx : synthèse analytique dérivée de la base
    ci-dessus. Feuilles utilisées : Synthèse, Revenus, Affectations,
    Facteurs 2023 (facteurs de variation + prix internationaux), Risques,
    Dictionnaire KPI, Sources.

Toutes les valeurs sont lues directement dans les classeurs (aucune
retranscription manuelle de chiffres) pour éviter toute erreur de saisie.
Conformément à la règle du projet ("ne rien cacher, toutes ces données sont
publiques"), rien n'est résumé, arrondi au-delà de la source, ni omis : les
avertissements de comparabilité inter-annuels et les incohérences déjà
documentées par l'utilisateur dans les classeurs sont repris tels quels
dans les champs `qualite` de chaque table.
"""
import collections
import json

import openpyxl

WH_PATH = "data/warehouse.seed.json"
BASE_BI_PATH = "scripts/sources_apercu/base_bi.xlsx"
ANALYSE_BI_PATH = "scripts/sources_apercu/analyse_bi.xlsx"

META_COMMON = {
    "theme": "rapports",
    "theme_label": "Rapports, sources et méthodologie",
    "devise": "USD",
    "perimetre": "Secteur extractif de la RDC (mines et hydrocarbures)",
}


def ds(label, cat, desc, cols, types, rows, extra_meta):
    meta = dict(META_COMMON)
    meta.update(extra_meta)
    return {"label": label, "cat": cat, "desc": desc, "cols": cols, "types": types, "rows": rows, "meta": meta}


def rows_of(ws, min_row=2):
    return [list(r) for r in ws.iter_rows(min_row=min_row, values_only=True) if any(c is not None for c in r)]


def main():
    with open(WH_PATH, encoding="utf-8") as f:
        wh = json.load(f, object_pairs_hook=collections.OrderedDict)

    base_wb = openpyxl.load_workbook(BASE_BI_PATH, data_only=True)
    an_wb = openpyxl.load_workbook(ANALYSE_BI_PATH, data_only=True)

    lisez_moi = "\n".join(str(r[0]) for r in base_wb["Lisez-moi"].iter_rows(values_only=True) if r[0])

    # ------------------------------------------------------------------
    # 1) Série annuelle 2007-2023 (17 exercices + ligne CUMUL)
    # ------------------------------------------------------------------
    ws = base_wb["Série annuelle"]
    all_rows = rows_of(ws)
    cols = [c for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
    wh["datasets"]["apercu_serie_annuelle_2007_2023"] = ds(
        "Vue d'ensemble — Série annuelle des revenus extractifs (2007-2023)",
        "Vue d'ensemble",
        "Série longue reconstituée exercice par exercice (2007 à 2023, plus une ligne de cumul), combinant "
        "17 rapports ITIE-RDC de nature hétérogène : rapports de conciliation 2007-2013 (PwC, Fair Links, "
        "KPMG, Moore Stephens), EITI Summary Data 2014-2023 (sauf 2018, couvert par le rapport assoupli "
        "2018-2019-1er semestre 2020, méthode non conciliée), fournie directement par l'utilisateur "
        "(Base_BI_Rapports_ITIE_RDC_2007-2023.xlsx, feuille « Série annuelle »). Distincte du graphique "
        "« Recettes de l'État par exercice » ci-dessus (agrégat serie_etat, périmètre de réconciliation "
        "budgétaire) : cette série vise l'ensemble des revenus extractifs déclarés, tous secteurs et "
        "sources confondus, avec le détail minier/hydrocarbures, la production (cuivre, cobalt, or) et le "
        "poids macroéconomique (PIB, recettes publiques, exportations) quand ces informations sont "
        "disponibles pour l'exercice.",
        cols,
        ["num", "num", "num", "num", "num", "num", "num", "num", "num", "num", "num", "num", "num", "num", "str", "str"],
        all_rows,
        {
            "periode": "2007–2023",
            "unite": "USD courants ; parts et croissance en proportion (0 à 1) ; production en tonnes (cuivre, cobalt) et kg (or)",
            "desagregation": "par exercice",
            "source": "Base_BI_Rapports_ITIE_RDC_2007-2023.xlsx (feuille « Série annuelle »), fournie directement par l'utilisateur, elle-même construite à partir des 17 rapports ITIE-RDC 2007-2023 et des 9 fichiers EITI Summary Data 2014-2023.",
            "qualite": lisez_moi + " Champ « Notes / faits marquants » : commentaire propre à chaque exercice, reproduit intégralement dans la colonne éponyme de ce tableau plutôt que résumé ici.",
        },
    )

    # ------------------------------------------------------------------
    # 2) Synthèse BI (indicateurs clés 2023 + constats + actions prioritaires)
    # ------------------------------------------------------------------
    ws = an_wb["Synthèse"]
    vals = list(ws.iter_rows(values_only=True))
    kpi_rows = []
    constats = None
    actions = None
    mode = None
    for r in vals:
        if r[0] == "Indicateur" and r[1] == "Valeur":
            mode = "kpi"
            continue
        if r[0] == "Constats principaux":
            mode = "constats"
            continue
        if r[0] == "Actions prioritaires":
            mode = "actions"
            continue
        if mode == "kpi" and r[0] and r[1] is not None:
            kpi_rows.append([r[0], r[1]])
        elif mode == "constats" and r[0]:
            constats = r[0]
            mode = None
        elif mode == "actions" and r[0]:
            actions = r[0]
            mode = None

    wh["datasets"]["apercu_synthese_bi"] = ds(
        "Vue d'ensemble — Synthèse analytique 2023 (indicateurs clés)",
        "Vue d'ensemble",
        "Indicateurs clés de synthèse pour l'exercice 2023, calculés par l'utilisateur à partir de la base "
        "ci-dessus (Analyse_BI_ITIE_RDC 1.xlsx, feuille « Synthèse »). Voir le champ qualité pour les "
        "constats et actions prioritaires associés, reproduits intégralement.",
        ["Indicateur", "Valeur"],
        ["str", "num"],
        kpi_rows,
        {
            "periode": "2023 (TCAM calculé sur 2018-2023)",
            "unite": "USD pour les revenus ; proportion (0 à 1) pour les parts et taux de croissance",
            "desagregation": "indicateur agrégé national",
            "source": "Analyse_BI_ITIE_RDC 1.xlsx (feuille « Synthèse »), fournie directement par l'utilisateur.",
            "qualite": "Constats principaux : " + (constats or "—") + " || Actions prioritaires : " + (actions or "—"),
        },
    )

    # ------------------------------------------------------------------
    # 3) Affectation des revenus 2022 et 2023
    # ------------------------------------------------------------------
    ws = an_wb["Affectations"]
    rows = rows_of(ws, min_row=3)
    wh["datasets"]["apercu_affectation_revenus_2022_2023"] = ds(
        "Vue d'ensemble — Affectation des revenus extractifs (2022 et 2023)",
        "Vue d'ensemble",
        "Ventilation des revenus extractifs par bénéficiaire final (Trésor et revenus budgétaires, "
        "entreprises d'État, fonds propres des régies, FOMIN, autres entités publiques, FONAREV et ACE, "
        "revenus infranationaux, paiements sociaux et environnementaux), comparant 2022 et 2023.",
        list(next(ws.iter_rows(min_row=2, max_row=2, values_only=True))),
        ["str", "num", "num", "num", "num", "num"],
        rows,
        {
            "periode": "2022–2023",
            "unite": "USD ; dernières colonnes en proportion (0 à 1)",
            "desagregation": "par catégorie de bénéficiaire",
            "source": "Analyse_BI_ITIE_RDC 1.xlsx (feuille « Affectations »), fournie directement par l'utilisateur.",
            "qualite": "Calculé à partir des données ITIE-RDC 2022 et 2023 par l'utilisateur ; '#N/A' dans le classeur source (ex. FONAREV et ACE, nul en 2022) reproduit tel quel.",
        },
    )

    # ------------------------------------------------------------------
    # 4) Facteurs de variation 2022 -> 2023
    # ------------------------------------------------------------------
    ws = an_wb["Facteurs 2023"]
    all_vals = list(ws.iter_rows(values_only=True))
    # bloc 1 : lignes 3 à 8 (index 2 à 7) = facteurs de variation
    facteurs_rows = [list(r[:5]) for r in all_vals[2:8]]
    wh["datasets"]["apercu_facteurs_variation_2023"] = ds(
        "Vue d'ensemble — Facteurs de variation des revenus (2022 → 2023)",
        "Vue d'ensemble",
        "Principaux flux fiscaux expliquant le recul des revenus extractifs entre 2022 et 2023, avec "
        "l'interprétation retenue par l'utilisateur pour chacun.",
        ["Flux", "2022 USD", "2023 USD", "Variation USD", "Interprétation"],
        ["str", "num", "num", "num", "str"],
        facteurs_rows,
        {
            "periode": "2022–2023",
            "unite": "USD",
            "desagregation": "par flux fiscal",
            "source": "Analyse_BI_ITIE_RDC 1.xlsx (feuille « Facteurs 2023 »), fournie directement par l'utilisateur.",
            "qualite": "Sélection des flux jugés les plus significatifs par l'utilisateur ; ne prétend pas à l'exhaustivité de l'ensemble des flux fiscaux du secteur (voir la table des flux complets, rubrique Paiements des entreprises et recettes de l'État, pour le détail exhaustif).",
        },
    )

    # bloc 2 : prix internationaux (reformaté en table longue année/produit)
    # repère l'en-tête "Produit","Unité","2020","2021","2022","2023"
    header_idx = next(i for i, r in enumerate(all_vals) if r[0] == "Produit")
    price_header = all_vals[header_idx]
    years_cols = price_header[2:]
    prix_rows = []
    for r in all_vals[header_idx + 1:]:
        if not r[0]:
            continue
        produit, unite = r[0], r[1]
        for yi, annee in enumerate(years_cols):
            val = r[2 + yi]
            if val is not None:
                try:
                    annee_num = int(annee)
                except (TypeError, ValueError):
                    annee_num = annee
                prix_rows.append([annee_num, produit, unite, val])
    wh["datasets"]["apercu_prix_internationaux"] = ds(
        "Vue d'ensemble — Prix internationaux des matières premières (2020-2023)",
        "Vue d'ensemble",
        "Cours internationaux de référence des principales matières premières exportées par la RDC "
        "(cuivre, zinc, diamant, cobalt, coltan, or) et du pétrole, 2020-2023 — contexte utile pour "
        "interpréter les variations des revenus extractifs d'un exercice à l'autre.",
        ["Année", "Produit", "Unité", "Prix"],
        ["num", "str", "str", "num"],
        prix_rows,
        {
            "periode": "2020–2023",
            "unite": "voir colonne Unité (USD/t, USD/carat, USD/lb, USD/once, USD/baril selon le produit)",
            "desagregation": "par produit et par année",
            "source": "Analyse_BI_ITIE_RDC 1.xlsx (feuille « Facteurs 2023 », bloc « Prix internationaux »), fournie directement par l'utilisateur.",
            "qualite": "Reproduction intégrale du tableau fourni ; méthodologie et source primaire des cours (bourse de référence) non précisées dans le classeur transmis.",
        },
    )

    # ------------------------------------------------------------------
    # 5) Registre des risques stratégiques
    # ------------------------------------------------------------------
    ws = an_wb["Risques"]
    rows = rows_of(ws, min_row=3)
    wh["datasets"]["apercu_risques_strategiques"] = ds(
        "Vue d'ensemble — Registre des risques stratégiques",
        "Vue d'ensemble",
        "Registre des risques stratégiques identifiés par l'utilisateur pour le suivi de la transparence "
        "du secteur extractif (probabilité et impact notés de 1 à 5, score = probabilité × impact), avec "
        "les éléments observés et la réponse proposée pour chacun.",
        list(next(ws.iter_rows(min_row=2, max_row=2, values_only=True))),
        ["str", "num", "num", "num", "str", "str", "str"],
        rows,
        {
            "periode": "2023 (dernier exercice disponible)",
            "unite": "Probabilité et impact : échelle 1 (faible) à 5 (critique) ; score = probabilité × impact",
            "desagregation": "par risque",
            "source": "Analyse_BI_ITIE_RDC 1.xlsx (feuille « Risques »), fournie directement par l'utilisateur.",
            "qualite": "Évaluation qualitative propre à l'utilisateur (dire d'expert), non issue d'un processus de cotation formel du Comité Exécutif ITIE-RDC.",
        },
    )

    # ------------------------------------------------------------------
    # 6) Dictionnaire des indicateurs de pilotage
    # ------------------------------------------------------------------
    ws = an_wb["Dictionnaire KPI"]
    rows = rows_of(ws, min_row=3)
    wh["datasets"]["apercu_dictionnaire_kpi"] = ds(
        "Vue d'ensemble — Dictionnaire des indicateurs de pilotage",
        "Vue d'ensemble",
        "Définition, unité, fréquence recommandée et source de chacun des indicateurs de pilotage utilisés "
        "dans la Vue d'ensemble et l'Analyse BI transversale.",
        list(next(ws.iter_rows(min_row=2, max_row=2, values_only=True))),
        ["str", "str", "str", "str", "str"],
        rows,
        {
            "periode": "—",
            "unite": "texte",
            "desagregation": "par indicateur",
            "source": "Analyse_BI_ITIE_RDC 1.xlsx (feuille « Dictionnaire KPI »), fournie directement par l'utilisateur.",
            "qualite": "Glossaire méthodologique interne à l'utilisateur ; ne remplace pas les définitions officielles de la Norme ITIE.",
        },
    )

    # ------------------------------------------------------------------
    # 7) Inventaire des sources (traçabilité)
    # ------------------------------------------------------------------
    ws = an_wb["Sources"]
    rows = rows_of(ws, min_row=3)
    wh["datasets"]["apercu_sources_analyse_bi"] = ds(
        "Vue d'ensemble — Inventaire des sources documentaires analysées",
        "Vue d'ensemble",
        "Inventaire des documents et classeurs sources utilisés pour construire la base BI 2007-2023 et "
        "l'analyse transversale (rapports ITIE annuels, EITI Summary Data, études thématiques), avec lien "
        "Google Drive d'origine pour chaque document — traçabilité complète des sources.",
        list(next(ws.iter_rows(min_row=2, max_row=2, values_only=True))),
        ["str", "str", "str", "num", "str", "str"],
        rows,
        {
            "periode": "2007–2026",
            "unite": "octets pour la taille de fichier ; texte pour le reste",
            "desagregation": "par document source",
            "source": "Analyse_BI_ITIE_RDC 1.xlsx (feuille « Sources »), fournie directement par l'utilisateur.",
            "qualite": "Liens Google Drive fournis par l'utilisateur, non vérifiés indépendamment par accès direct (dossier privé) ; reproduits tels quels à titre de traçabilité documentaire.",
        },
    )

    # ------------------------------------------------------------------
    # 8) Rapports thématiques transversaux (résumé quantifié, 9 études)
    # ------------------------------------------------------------------
    ws = base_wb["Thématiques"]
    rows = rows_of(ws, min_row=2)
    wh["datasets"]["apercu_rapports_thematiques"] = ds(
        "Vue d'ensemble — Rapports thématiques transversaux (résumé quantifié)",
        "Vue d'ensemble",
        "Résumé quantifié des 9 rapports thématiques et de la modélisation fiscale conduits par l'ITIE-RDC "
        "et ses prestataires (répartition de la redevance minière, divulgations des entreprises publiques, "
        "propriété effective, divulgation des contrats, évaluation de la Convention SICOMINES, octroi des "
        "droits miniers et pétroliers, revue des états financiers des EP 2016, modélisation fiscale de "
        "grands projets miniers, faisabilité du mainstreaming ITIE/DISM) — objet, chiffres clés, constats "
        "et recommandations de chaque étude, reproduits intégralement.",
        list(next(ws.iter_rows(min_row=1, max_row=1, values_only=True))),
        ["str", "num", "str", "str", "str", "str"],
        rows,
        {
            "periode": "2018–2026 (études conduites sur cette période, portant sur des exercices antérieurs)",
            "unite": "texte ; montants en USD ou CDF précisés dans le corps de chaque ligne « Chiffres clés »",
            "desagregation": "par étude thématique",
            "source": "Base_BI_Rapports_ITIE_RDC_2007-2023.xlsx (feuille « Thématiques »), fournie directement par l'utilisateur, elle-même issue de 9 rapports thématiques ITIE-RDC et d'une étude de modélisation fiscale.",
            "qualite": "Résumés élaborés par l'utilisateur à partir des rapports thématiques originaux (voir apercu_sources_analyse_bi pour les liens vers les documents complets) ; un doublon documentaire est signalé explicitement par l'utilisateur dans la dernière ligne (« État des lieux Redevance Minière et Recettes Pétrolières de Catégorie B », contenu identique au rapport « Répartition et affectation de la redevance minière »).",
        },
    )

    with open(WH_PATH, "w", encoding="utf-8") as f:
        json.dump(wh, f, ensure_ascii=False, indent=1)

    new_keys = [
        "apercu_serie_annuelle_2007_2023", "apercu_synthese_bi", "apercu_affectation_revenus_2022_2023",
        "apercu_facteurs_variation_2023", "apercu_prix_internationaux", "apercu_risques_strategiques",
        "apercu_dictionnaire_kpi", "apercu_sources_analyse_bi", "apercu_rapports_thematiques",
    ]
    for k in new_keys:
        print(f"OK — {k} : {len(wh['datasets'][k]['rows'])} lignes.")
    print(f"Total datasets : {len(wh['datasets'])}")


if __name__ == "__main__":
    main()
