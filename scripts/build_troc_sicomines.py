#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Intègre l'analyse RFI_4.3_SICOMINES.xlsx (Exigence ITIE 4.3 — fourniture
d'infrastructures et accords de troc, programme sino-congolais / SICOMINES)
comme nouvelle rubrique publique du portail, au même titre que les autres
thèmes ITIE (cadre_licences, propriete, etc.).

Principe (« ne rien cacher, toutes ces données sont publiques ») : chaque
ligne du classeur source est reprise telle quelle, sans recalcul ni
arbitrage entre sources concurrentes — y compris lorsque plusieurs agences
(ACGT, BCPSC/APCSC, SICOMINES, DGDP) publient des montants différents pour
le même agrégat : ces divergences sont elles-mêmes conservées comme donnée
(onglets « Sources & écarts » et « Grille conformité 4.3 »).

Les 10 onglets substantiels du classeur (tout sauf « Lisez-moi », qui sert
de méthodologie et alimente la description de la rubrique) sont convertis
en tables de l'entrepôt, toutes taguées theme='troc_sicomines', afin de
bénéficier automatiquement du moteur générique de rendu par thème
(mTheme()/themeCard() dans app.js) : aucune modification du JS n'est requise.
"""
import json
import re

XLSX_PATH = "data/uploads_src/RFI_4.3_SICOMINES.xlsx"
WH_PATH = "data/warehouse.seed.json"

THEME_KEY = "troc_sicomines"
THEME_LABEL = "Fourniture d'infrastructures et accords de troc (SICOMINES)"
THEME_EITI = "Exigence 4.3"
THEME_DESC = ("Cartographie et analyse de conformité du Programme sino-congolais / SICOMINES — "
              "seul accord assimilé par le Comité Exécutif ITIE-RDC à un accord de type troc — "
              "à l'aune de l'Exigence 4.3 de la Norme ITIE : convention et avenants, flux financiers "
              "annuels, projets d'infrastructures financés, sous-projet hydroélectrique Busanga, "
              "gouvernance, grille de conformité, écarts entre sources, constats et recommandations.")

SOURCE_NOTE = ("Rapport thématique ITIE-RDC « Exigence 4.3 : fourniture d'infrastructures et accords de "
               "troc — Programme sino-congolais/SICOMINES » (déc. 2021) ; Rapports ITIE-RDC annuels "
               "2011 à 2023 ; note d'orientation du Secrétariat International ITIE (févr. 2021) ; "
               "rapport de l'Inspection Générale des Finances (nov. 2021). Voir l'onglet "
               "« Sources & écarts » pour le détail des divergences entre agences.")
QUALITE_NOTE = ("Plusieurs agrégats font l'objet de déclarations divergentes entre agences (ACGT, "
                "BCPSC/APCSC, SICOMINES, DGDP) : ces divergences ne sont pas arbitrées ici et sont "
                "documentées telles quelles (voir tables « écarts entre sources » et « grille de "
                "conformité 4.3 »). Une cellule vide ou « ND » signifie une information non divulguée "
                "dans les sources consultées.")


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    return v


def rows_of(ws):
    for row in ws.iter_rows(values_only=True):
        yield [clean(c) for c in row]


def is_blank(row):
    return all(c is None for c in row)


def json_to_lines(raw):
    """Convertit une cellule JSON structurée (prêts, remboursement, garanties,
    exonérations, titres miniers, objectifs) en texte lisible clé: valeur,
    sans changer une seule information : simple mise en forme du même JSON
    source, jamais une réécriture de son contenu."""
    try:
        obj = json.loads(raw)
    except Exception:
        return raw

    def fmt(o, prefix=""):
        lines = []
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, (dict, list)):
                    lines.append(f"{prefix}{k} :")
                    lines.extend(fmt(v, prefix + "  "))
                else:
                    lines.append(f"{prefix}{k} : {v}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                if isinstance(v, (dict, list)):
                    lines.append(f"{prefix}- item {i+1} :")
                    lines.extend(fmt(v, prefix + "    "))
                else:
                    lines.append(f"{prefix}- {v}")
        else:
            lines.append(f"{prefix}{o}")
        return lines

    return "\n".join(fmt(obj))


def looks_like_json(v):
    return isinstance(v, str) and v.strip().startswith("{") and v.strip().endswith("}")


def build_instruments_and_avenants(ws):
    """Onglet « Convention & Avenants » : sépare le tableau structuré des 5
    avenants (7 colonnes) du reste (narratif / clé-valeur / JSON), regroupé
    dans une table générique Élément/Détail."""
    all_rows = list(rows_of(ws))
    avenants_header_idx = None
    for i, r in enumerate(all_rows):
        if r[:2] == ["N°", "Convention modifiée"]:
            avenants_header_idx = i
            break
    avenants_rows = []
    if avenants_header_idx is not None:
        for r in all_rows[avenants_header_idx + 1:]:
            if is_blank(r) or r[0] is None:
                break
            avenants_rows.append([r[0], r[1], r[2], r[3], r[4], r[5], r[6]])

    instruments_rows = []
    skip_until = avenants_header_idx if avenants_header_idx is not None else len(all_rows)
    section = None
    for i, r in enumerate(all_rows):
        if avenants_header_idx is not None and avenants_header_idx <= i <= avenants_header_idx + 1 + len(avenants_rows):
            continue
        if is_blank(r):
            continue
        vals = [c for c in r if c is not None]
        if len(vals) == 1 and str(vals[0]).isupper() and len(str(vals[0])) > 3:
            section = vals[0]
            continue
        if vals and vals[0] in ("Elément", "Instrument", "N°", "Note"):
            continue
        if len(vals) >= 2:
            key, val = vals[0], vals[1] if len(vals) == 2 else " | ".join(str(x) for x in vals[1:])
        elif len(vals) == 1:
            key, val = section or "Note", vals[0]
        else:
            continue
        if looks_like_json(str(val)):
            val = json_to_lines(str(val))
        label = f"{section} — {key}" if section and key != section else (key or section)
        instruments_rows.append([label, val])

    return instruments_rows, avenants_rows


def build_kv_table(ws, skip_headers=("Elément", "Indicateur")):
    """Onglets en blocs 'TITRE DE SECTION' + paires clé/valeur (Busanga,
    partie 'Convention & Avenants' générique) -> table Élément/Détail."""
    out = []
    section = None
    for r in rows_of(ws):
        if is_blank(r):
            continue
        vals = [c for c in r if c is not None]
        if len(vals) == 1:
            section = vals[0]
            continue
        if vals[0] in skip_headers:
            continue
        key = f"{section} — {vals[0]}" if section else vals[0]
        val = vals[1] if len(vals) > 1 else ""
        out.append([key, val])
    return out


def build_infrastructures(ws):
    """Onglet « Projets infrastructures » : sépare le tableau détaillé des
    projets documentés individuellement (8 colonnes) du reste (indicateurs
    agrégés en plusieurs blocs Indicateur/Valeur ou Source/Montant)."""
    all_rows = list(rows_of(ws))
    proj_header_idx = None
    for i, r in enumerate(all_rows):
        if r[:2] == ["Désignation", "Lieu"]:
            proj_header_idx = i
            break
    projets_rows = []
    if proj_header_idx is not None:
        for r in all_rows[proj_header_idx + 1:]:
            if is_blank(r):
                break
            projets_rows.append(r[:8] + [None] * (8 - len(r[:8])))

    indicateurs_rows = []
    section = None
    for i, r in enumerate(all_rows):
        if proj_header_idx is not None and proj_header_idx <= i <= proj_header_idx + len(projets_rows):
            continue
        if is_blank(r):
            continue
        vals = [c for c in r if c is not None]
        if len(vals) == 1:
            # Une ligne à une seule valeur est un titre de (sous-)section
            # dans la mise en page de cet onglet (ex. « Cadre conventionnel »,
            # « BILAN THÉMATIQUE 2008-2020 (...) »), SAUF si le texte est un
            # paragraphe narratif long (ex. la description du Cadre
            # conventionnel elle-même) : dans ce cas on le rattache comme
            # détail de la section en cours plutôt que d'écraser son titre,
            # pour ne perdre aucune information de la source.
            if len(str(vals[0])) > 100 and section:
                indicateurs_rows.append([section, vals[0]])
            else:
                section = vals[0]
            continue
        if vals[0] in ("Indicateur", "Source"):
            continue
        key = f"{section} — {vals[0]}" if section else vals[0]
        val = vals[1] if len(vals) == 2 else " | ".join(str(x) for x in vals[1:])
        indicateurs_rows.append([key, val])

    return indicateurs_rows, projets_rows


def build_gouvernance(ws):
    all_rows = list(rows_of(ws))
    entites_header = None
    audits_header = None
    for i, r in enumerate(all_rows):
        if r[:2] == ["Entité", "Base juridique"]:
            entites_header = i
        if r[:2] == ["Audit / évaluation", "Date"]:
            audits_header = i
    entites_rows = []
    for r in all_rows[entites_header + 1:]:
        vals = [c for c in r if c is not None]
        if is_blank(r):
            continue
        if len(vals) == 1 and str(vals[0]).isupper() and len(str(vals[0])) > 5:
            break
        entites_rows.append(r[:4] + [None] * (4 - len(r[:4])))
    audits_rows = []
    for r in all_rows[audits_header + 1:]:
        vals = [c for c in r if c is not None]
        if is_blank(r):
            continue
        if len(vals) == 1 and str(vals[0]).isupper() and len(str(vals[0])) > 5:
            break
        audits_rows.append(r[:4] + [None] * (4 - len(r[:4])))

    # Narratif restant (supervision des flux compensatoires, formulaires ITIE
    # spécifiques) -> versé dans la table générique "instruments" en retour
    # de fonction pour être fusionné par l'appelant.
    narratif = []
    section = None
    started_extra = False
    for i, r in enumerate(all_rows):
        if is_blank(r):
            continue
        vals = [c for c in r if c is not None]
        if len(vals) == 1 and str(vals[0]).isupper() and len(str(vals[0])) > 5:
            section = vals[0]
            if section in ("SUPERVISION DE LA VALEUR DES FLUX COMPENSATOIRES", "FORMULAIRES ITIE SPÉCIFIQUES SICOMINES"):
                started_extra = True
            else:
                started_extra = False
            continue
        if started_extra and vals:
            narratif.append([section, " | ".join(str(x) for x in vals)])

    return entites_rows, audits_rows, narratif


def build_flat_table(ws, ncols, header_match=None, stop_values=()):
    rows = list(rows_of(ws))
    out = []
    started = header_match is None
    for r in rows:
        if not started:
            if r[:len(header_match)] == header_match:
                started = True
            continue
        if is_blank(r):
            continue
        if r[0] in stop_values:
            break
        vals = r[:ncols] + [None] * (ncols - len(r[:ncols]))
        if all(v is None for v in vals):
            continue
        out.append(vals)
    return out


def build_constats_recommandations(ws):
    rows = list(rows_of(ws))
    out = []
    mode = None
    for r in rows:
        if is_blank(r):
            continue
        vals = [c for c in r if c is not None]
        if len(vals) == 1 and str(vals[0]).isupper() and len(str(vals[0])) > 5:
            if "CONSTAT" in vals[0]:
                mode = "Constat"
            elif "RECOMMANDATION" in vals[0]:
                mode = "Recommandation"
            continue
        if vals[:1] and vals[0] in ("N°",):
            continue
        if mode and len(vals) >= 2 and isinstance(vals[0], (int, float)):
            out.append([mode, vals[0], vals[1]])
    return out


def build_indicateurs_cles(ws):
    rows = list(rows_of(ws))
    out = []
    section = "Tableau de bord"
    for r in rows:
        if is_blank(r):
            continue
        vals = [c for c in r if c is not None]
        if len(vals) == 1 and str(vals[0]).isupper():
            section = vals[0]
            continue
        if vals[:1] and vals[0] == "Indicateur":
            continue
        if len(vals) == 2:
            out.append([f"{section} — {vals[0]}" if section != "Tableau de bord" else vals[0], vals[1]])
    return out


def ds(label, cat, desc, cols, types, rows, extra_meta=None):
    meta = {
        "theme": THEME_KEY, "theme_label": THEME_LABEL,
        "periode": "2007–2025", "unite": "texte et montants (USD sauf indication)",
        "devise": "USD", "source": SOURCE_NOTE,
        "perimetre": "Programme sino-congolais (Convention de Collaboration du 22/04/2008) et JV SICOMINES SA",
        "desagregation": "variable selon la table (voir colonnes)",
        "qualite": QUALITE_NOTE,
    }
    if extra_meta:
        meta.update(extra_meta)
    return {"label": label, "cat": cat, "desc": desc, "cols": cols,
            "types": types, "rows": [[("" if c is None else c) for c in r] for r in rows],
            "meta": meta}


def main():
    import openpyxl
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)

    instruments_rows, avenants_rows = build_instruments_and_avenants(wb["Convention & Avenants"])
    busanga_rows = build_kv_table(wb["Busanga-SICOHYDRO"])
    infra_indic_rows, projets_rows = build_infrastructures(wb["Projets infrastructures"])
    entites_rows, audits_rows, gouv_narratif = build_gouvernance(wb["Gouvernance"])
    instruments_rows = instruments_rows + gouv_narratif
    flux_rows = build_flat_table(wb["Flux annuels"], 5, header_match=["Exercice", "Indicateur"])
    conformite_rows = build_flat_table(wb["Grille conformité 4.3"], 4,
                                        header_match=["Elément de divulgation (Exigence 4.3)", "Statut"],
                                        stop_values=("Légende",))
    ecarts_rows = build_flat_table(wb["Sources & écarts"], 5, header_match=["Agrégat", "Valeur / Source A"],
                                    stop_values=("Implication pour l'Exigence 4.3",))
    constats_reco_rows = build_constats_recommandations(wb["Constats & recommandations"])
    indicateurs_rows = build_indicateurs_cles(wb["Analyse"])

    datasets = {}
    datasets["troc_sicomines_instruments"] = ds(
        "SICOMINES — Convention, structure juridique et financière", "dimensions",
        "Instruments juridiques fondateurs, structure capitalistique de la JV, pas-de-porte, prêts, "
        "régimes de remboursement, garanties de l'État, exonérations fiscales, titres miniers cédés, "
        "objectifs techniques conventionnels, engagements des parties.",
        ["Élément", "Détail"], ["str", "str"], instruments_rows)

    datasets["troc_sicomines_avenants"] = ds(
        "SICOMINES — Les 5 avenants à la Convention (2008-2024)", "dimensions",
        "Détail des cinq avenants successifs à la Convention de Collaboration du 22/04/2008, leurs "
        "dates, objets et changements clés.",
        ["N°", "Convention modifiée", "Date", "Note sur la date", "Objet", "Changements clés", "Source"],
        ["num", "str", "date", "str", "str", "str", "str"], avenants_rows)

    datasets["troc_sicomines_flux_annuels"] = ds(
        "SICOMINES — Série chronologique des flux financiers (2009-2025)", "faits",
        "Tous les flux financiers déclarés par exercice ou période : mobilisations, investissements, "
        "remboursements, dividendes, fiscalité, jetons de présence.",
        ["Exercice", "Indicateur", "Valeur (USD)", "Détail", "Source"],
        ["str", "str", "num", "str", "str"], flux_rows)

    datasets["troc_sicomines_infrastructures"] = ds(
        "SICOMINES — Indicateurs agrégés des projets d'infrastructures", "faits",
        "Bilans successifs (2008-2020, 2020-2021, 2025) des projets d'infrastructures financés par le "
        "programme : nombre de projets, montants engagés, éligibilité à l'Annexe C, montants divergents "
        "déclarés par chaque agence.",
        ["Indicateur", "Détail"], ["str", "str"], infra_indic_rows)

    datasets["troc_sicomines_projets"] = ds(
        "SICOMINES — Projets d'infrastructures documentés individuellement", "faits",
        "Liste des projets d'infrastructures individuellement documentés par les rapports ITIE-RDC : "
        "désignation, localisation, entreprise exécutante, coût, statut d'avancement et éligibilité à "
        "la liste conventionnelle (Annexe C).",
        ["Désignation", "Lieu", "Entreprise", "Coût (USD)", "Statut", "Éligible Annexe C", "Note", "Source"],
        ["str", "str", "str", "num", "str", "str", "str", "str"], projets_rows)

    datasets["troc_sicomines_busanga"] = ds(
        "SICOMINES — Sous-projet hydroélectrique Busanga (SICOHYDRO)", "dimensions",
        "Structure capitalistique de SICOHYDRO (2016 puis après l'Avenant n°5 de 2024) et montants "
        "décaissés pour la centrale hydroélectrique de Busanga.",
        ["Élément", "Valeur"], ["str", "str"], busanga_rows)

    datasets["troc_sicomines_gouvernance_entites"] = ds(
        "SICOMINES — Entités du montage institutionnel", "dimensions",
        "Les entités impliquées dans la gouvernance du programme (BCPSC/APCSC, ACGT, Ministère des "
        "ITPR, SICOMINES, GECAMINES/SIMCO, EXIM BANK of CHINA, commissions de renégociation), leur base "
        "juridique, leur rôle et les limites constatées.",
        ["Entité", "Base juridique", "Rôle / structure", "Appréciation / limite"],
        ["str", "str", "str", "str"], entites_rows)

    datasets["troc_sicomines_gouvernance_audits"] = ds(
        "SICOMINES — Audits et évaluations réalisés", "faits",
        "Recensement des audits et évaluations indépendantes réalisés sur le programme (étude "
        "thématique ITIE, rapport IGF, audits post-2024) et de ceux recommandés mais non réalisés.",
        ["Audit / évaluation", "Date", "Objet", "Source"], ["str", "str", "str", "str"], audits_rows)

    datasets["troc_sicomines_conformite_43"] = ds(
        "SICOMINES — Grille d'auto-évaluation de conformité (Exigence 4.3)", "faits",
        "Confrontation des éléments de divulgation attendus par la note d'orientation du Secrétariat "
        "International ITIE (février 2021) à l'état des lieux du dossier SICOMINES.",
        ["Élément de divulgation (Exigence 4.3)", "Statut", "Constat", "Source"],
        ["str", "str", "str", "str"], conformite_rows,
        extra_meta={"qualite": QUALITE_NOTE + " Statuts fixés par l'analyste sur la base des constats "
                    "agrégés des rapports ; ils ne se substituent pas à une validation formelle du "
                    "Comité Exécutif ITIE-RDC."})

    datasets["troc_sicomines_sources_ecarts"] = ds(
        "SICOMINES — Écarts chiffrés entre sources", "faits",
        "Recensement des divergences chiffrées entre agences (SICOMINES, BCPSC/APCSC, ACGT, DGDP) sur "
        "un même agrégat, avec le commentaire du rapport thématique. Ces écarts ne sont pas arbitrés : "
        "toutes les valeurs concurrentes sont rapportées. Implication pour l'Exigence 4.3 : ces écarts, "
        "documentés par le rapport thématique ITIE-RDC (2021) et confirmés par les rapports annuels "
        "2020-2021 et 2023, constituent le principal frein à une divulgation fiable de la « valeur des "
        "flux compensatoires » exigée par le point (c) de l'Exigence 4.3. Aucun mécanisme de "
        "réconciliation entre ACGT, APCSC/BCPSC, SICOMINES et DGDP n'est documenté à ce jour.",
        ["Agrégat", "Valeur / Source A", "Valeur / Source B", "Valeur / Source C", "Commentaire"],
        ["str", "str", "str", "str", "str"], ecarts_rows)

    datasets["troc_sicomines_constats_recommandations"] = ds(
        "SICOMINES — Constats de non-conformité et recommandations", "faits",
        "Constats de non-conformité dénoncés par les rapports ITIE-RDC et l'IGF, et recommandations "
        "portées par ces mêmes rapports.",
        ["Type", "N°", "Texte"], ["str", "num", "str"], constats_reco_rows)

    datasets["troc_sicomines_indicateurs_cles"] = ds(
        "SICOMINES — Tableau de bord des indicateurs clés", "faits",
        "Indicateurs chiffrés de synthèse (totaux, ratios d'exécution, compteurs de conformité) calculés "
        "à partir des tableaux détaillés de cette rubrique.",
        ["Indicateur", "Valeur"], ["str", "str"], indicateurs_rows)

    with open(WH_PATH, encoding="utf-8") as f:
        wh = json.load(f)
    wh.setdefault("datasets", {})
    for name, d in datasets.items():
        wh["datasets"][name] = d
    # Insertion juste après 'paiements_recettes' (Exigence 4.1) et avant
    # 'reconciliation' (Exigences 4.1 et 4.9), pour respecter l'ordre
    # numérique des exigences ITIE dans le menu latéral (généré dans l'ordre
    # des clés de theme_info).
    wh.setdefault("theme_info", {})
    new_theme_info = {}
    inserted = False
    for k, v in wh["theme_info"].items():
        new_theme_info[k] = v
        if k == "paiements_recettes":
            new_theme_info[THEME_KEY] = {"label": THEME_LABEL, "eiti": THEME_EITI, "desc": THEME_DESC}
            inserted = True
    if not inserted:
        new_theme_info[THEME_KEY] = {"label": THEME_LABEL, "eiti": THEME_EITI, "desc": THEME_DESC}
    wh["theme_info"] = new_theme_info
    with open(WH_PATH, "w", encoding="utf-8") as f:
        json.dump(wh, f, ensure_ascii=False, indent=1)

    for name, d in datasets.items():
        print(f"{name}: {len(d['rows'])} lignes, {len(d['cols'])} colonnes")


if __name__ == "__main__":
    main()
