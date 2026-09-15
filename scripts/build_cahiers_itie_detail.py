#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enrichit les couches Géographie 'cahiers_nombre' (statut CPI) et 'cahiers_montant'
(dépenses sociales obligatoires) avec le détail par entreprise déjà présent dans les
annexes officielles ITIE-RDC (tables annexe_2022_49 / annexe_2023_37 pour le statut
CPI par province, et annexe_2022_33 / annexe_2023_38 / annexe_2023_40 pour les
montants par entreprise), afin de permettre un filtre par nom d'entreprise côté
Géographie (chip "Cahiers de charge — annexes officielles ITIE").

Principe : on ne recalcule, ne corrige ni n'invente aucune valeur. On restitue le
texte source des annexes tel quel (y compris ses imperfections de saisie), avec une
liste d'entreprises extraite par simple découpage du texte (', ' / ' et ' / ' ; ')
et le texte brut conservé à côté pour vérification. Une dépense non chiffrée dans la
source reste "non chiffré", jamais 0.
"""
import json
import re

GEO_PATH = "data/geo.seed.json"
WH_PATH = "data/warehouse.seed.json"

PROV_ISO = {
    "Haut-Katanga": "CD-HK",
    "Lualaba": "CD-LU",
    "Kasai-Oriental": "CD-KE",
    "Kasaï-Oriental": "CD-KE",
    "Haut-Uele": "CD-HU",
    "Ville de Kinshasa": "CD-KN",
    "Kinshasa": "CD-KN",
    "Kongo-Central": "CD-BC",
    "Nord-Kivu": "CD-NK",
}

STATUT_COLS = [
    (2, "approuve_autorite", "Approuvés par l'autorité compétente"),
    (3, "approuve_cpi_attente_autorite", "Approuvés par la CPI, en attente de l'autorité compétente"),
    (4, "en_instruction", "En cours d'instruction"),
    (5, "en_negociation", "En cours de négociation"),
    (6, "signe_non_transmis_cpi", "Signés avec les communautés, non transmis à la CPI"),
]


def split_entreprises(raw):
    """Découpe une cellule '12 : NOM1, NOM2 et NOM3' (ou une simple liste) en noms."""
    txt = str(raw).strip()
    if txt in ("", "0", "0.0"):
        return None, []
    declared = None
    m = re.match(r"^\s*(\d+)\s*:\s*(.*)$", txt)
    if m:
        declared = int(m.group(1))
        txt = m.group(2)
    # sépare sur virgule, point-virgule, et " et " (mot entier, insensible à la casse)
    parts = re.split(r",|;|\bet\b", txt, flags=re.IGNORECASE)
    names = [p.strip(" .") for p in parts if p.strip(" .")]
    return declared, names


def num_or_none(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s.lower() in ("n/c", "néant", "neant", "nc"):
        return None
    try:
        f = float(s)
        return f
    except ValueError:
        return None


def build_nombre_detail(wh):
    detail = {}
    flat = []
    for annee, key in (("2022", "annexe_2022_49"), ("2023", "annexe_2023_37")):
        ds = wh["datasets"][key]
        rows_out = []
        for r in ds["rows"]:
            prov_nom = str(r[1]).strip()
            if not prov_nom or prov_nom.lower() == "total":
                continue
            iso = PROV_ISO.get(prov_nom)
            statuts = []
            for idx, skey, slabel in STATUT_COLS:
                raw_cell = r[idx]
                declared, names = split_entreprises(raw_cell)
                statuts.append({
                    "key": skey, "label": slabel,
                    "count_declare": declared if declared is not None else (len(names) if names else 0),
                    "entreprises": names,
                    "raw": str(raw_cell),
                })
                for nm in names:
                    flat.append({
                        "annee": annee, "province_nom": prov_nom, "province_iso": iso,
                        "statut_key": skey, "statut_label": slabel, "entreprise": nm,
                    })
            rows_out.append({
                "province_nom": prov_nom, "province_iso": iso,
                "total_declare": num_or_none(r[-1]),
                "statuts": statuts,
            })
        detail[annee] = rows_out
    return detail, flat


def build_montant_detail(wh):
    # NB : l'annexe officielle comporte 4 colonnes de montant distinctes et non
    # équivalentes (numéraire "total de la dépense" vs numéraire "coût du projet
    # pour l'année" ; nature "coût de l'infrastructure" vs nature "coût du projet
    # pour l'année"), renseignées de façon inégale d'une entreprise à l'autre.
    # On restitue les 4 telles quelles, sans les additionner ni choisir laquelle
    # fait foi : un total calculé mélangerait des colonnes hétérogènes et risquerait
    # d'induire en erreur. Voir la note affichée avec le tableau.
    flat = []
    sources = [
        ("2022", "annexe_2022_33"),
        ("2023", "annexe_2023_38"),
        ("2023", "annexe_2023_40"),
    ]
    for annee, key in sources:
        ds = wh["datasets"][key]
        cur_ent = None
        for r in ds["rows"]:
            ent_cell = str(r[1]).strip() if len(r) > 1 else ""
            desc = str(r[2]).strip() if len(r) > 2 else ""
            if ent_cell:
                if ent_cell.lower().startswith("total ") or ent_cell.lower() == "total":
                    continue
                cur_ent = ent_cell
            if not cur_ent:
                continue
            if not desc and not ent_cell:
                continue
            if "n/c : non communiqué" in desc.lower() or "non communiqué" in str(r[3]).lower():
                continue
            m_num_total = num_or_none(r[13]) if len(r) > 13 else None
            m_num_annee = num_or_none(r[14]) if len(r) > 14 else None
            m_nat_infra = num_or_none(r[17]) if len(r) > 17 else None
            m_nat_annee = num_or_none(r[18]) if len(r) > 18 else None
            if all(x is None for x in (m_num_total, m_num_annee, m_nat_infra, m_nat_annee)) and not desc:
                continue
            flat.append({
                "annee": annee,
                "entreprise": cur_ent,
                "description": desc,
                "entite_beneficiaire": str(r[3]).strip() if len(r) > 3 else "",
                "region": str(r[5]).strip() if len(r) > 5 else "",
                "base_juridique": str(r[9]).strip() if len(r) > 9 else "",
                "montant_numeraire_total": m_num_total,
                "montant_numeraire_annee": m_num_annee,
                "montant_nature_infra": m_nat_infra,
                "montant_nature_annee": m_nat_annee,
            })
    return flat


def main():
    with open(GEO_PATH, encoding="utf-8") as f:
        geo = json.load(f)
    with open(WH_PATH, encoding="utf-8") as f:
        wh = json.load(f)

    nombre_detail, nombre_flat = build_nombre_detail(wh)
    montant_flat = build_montant_detail(wh)

    geo["layers"]["cahiers_nombre"]["statut_detail"] = nombre_detail
    geo["layers"]["cahiers_nombre"]["entreprises_detail"] = nombre_flat
    geo["layers"]["cahiers_montant"]["entreprises_detail"] = montant_flat

    with open(GEO_PATH, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, indent=1)

    print("cahiers_nombre: entreprises_detail =", len(nombre_flat), "lignes ; annees =", list(nombre_detail.keys()))
    print("cahiers_montant: entreprises_detail =", len(montant_flat), "lignes (4 colonnes de montant distinctes, non additionnees)")


if __name__ == "__main__":
    main()
