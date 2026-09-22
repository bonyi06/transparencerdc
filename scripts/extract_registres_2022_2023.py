#!/usr/bin/env python3
"""Extraction des registres CAMI (octrois, cessions, amodiations, contrats
d'options, permis d'exploitation octroi 2025, cession des parts à l'État)
transmis par l'utilisateur en septembre 2026, pour combler les lacunes
identifiées par le Secrétariat international de l'ITIE dans son Rapport de
Validation (Exigence 2.2 — Octrois des contrats et licences ; Exigence 2.3 —
Registre des licences) :

  « [...] la Gécamines transfère à ces contrats les droits rattachés à des
  permis miniers [...] Le dernier Rapport ITIE de la RDC ne contient pas de
  liste des licences minières octroyées par amodiation [...] le Rapport ITIE
  ne précise pas si les entreprises d'État ont octroyé des amodiations ou
  transféré des licences minières au cours de la période examinée. »

Ce script ne modifie, ne corrige ni ne complète aucune valeur : il transcrit
fidèlement chaque registre fourni par le CAMI, conformément à la règle du
site « ne rien cacher, toutes ces données sont publiques ». Les seules
libertés prises sont : conversion des dates Excel en chaînes ISO (AAAA-MM-JJ),
suppression des espaces parasites en tête/fin de nom, et l'ajout d'un
indicateur « entreprise_etat » (vrai/faux) lorsque le titulaire/cédant/
amodiant correspond à l'une des entreprises publiques du portefeuille minier
de l'État (GECAMINES, MIBA, SAKIMA, SOKIMO — entreprises notoirement connues
comme telles, cf. Rapports ITIE-RDC successifs) ; cet indicateur est calculé,
jamais deviné pour les autres sociétés (il reste `False` par défaut, jamais
`None`/absent, pour ne rien cacher de l'incertitude).
"""
import json
import re
from datetime import datetime
from pathlib import Path

import openpyxl

UPLOADS = Path("/root/.claude/uploads/73d4ced1-cb7c-5359-a313-8942c78c9061")
OUT_DIR = Path(__file__).resolve().parent.parent / "data"

# Entreprises publiques (portefeuille minier de l'État) notoirement connues
# comme telles dans les Rapports ITIE-RDC successifs. Liste volontairement
# restreinte à des cas non ambigus : on ne devine jamais le statut d'une
# société dont l'actionnariat public n'est pas de notoriété publique.
SOE_PATTERNS = [
    r"GENERALE DES CARRIERES ET DES MINES",  # GECAMINES
    r"\bGECAMINES\b",
    r"SOCIETE MINIERE DE BAKWANGA",  # MIBA
    r"\bMIBA\b",
    r"AURIFERE DU KIVU ET DU MANIEME",
    r"AURIFERE DU KIVU ET DU MANIEMA",  # SAKIMA
    r"\bSAKIMA\b",
    r"SOKIMO",  # Société Minière de Kilo-Moto
]
SOE_RE = re.compile("|".join(SOE_PATTERNS), re.IGNORECASE)


def is_soe(name):
    if not name:
        return False
    return bool(SOE_RE.search(name))


def clean(v):
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    if isinstance(v, datetime):
        return v.date().isoformat()
    return v


def load_rows(fn, sheet):
    wb = openpyxl.load_workbook(UPLOADS / fn, read_only=True, data_only=True)
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    return rows


def extract_octrois(fn, sheet, annee):
    """REGISTRE DES DROITS MINIERS OCTROYÉS EN <année> (CAMI).
    Colonnes : N°, TITULAIRES, N°DROIT, NATURE, CARRES, OCTROI, EXPIRATION,
    PROVINCE, STATUT. Des lignes d'en-tête de section (ex. « PERMIS
    D'EXPLOITATION - PE ») précèdent chaque groupe et sont ignorées (aucune
    donnée n'y figure, seulement un intitulé de regroupement)."""
    rows = load_rows(fn, sheet)
    out = []
    for row in rows[1:]:
        if row[0] is None and all(c is None for c in row[1:]):
            continue
        if isinstance(row[0], str):  # ligne d'en-tête de section
            continue
        titulaire = clean(row[1])
        out.append({
            "annee": annee,
            "titulaire": titulaire,
            "entreprise_etat": is_soe(titulaire),
            "numero_droit": clean(row[2]),
            "nature": clean(row[3]),
            "carres": row[4],
            "date_octroi": clean(row[5]),
            "date_expiration": clean(row[6]),
            "province": clean(row[7]),
            "statut": clean(row[8]),
        })
    return out


def extract_cessions(fn, sheet, annee):
    """REGISTRE DES CESSIONS DES DROITS MINIERS <année> (CAMI).
    Colonnes : N°, NOM DU CEDANT, NOM DU CESSIONNAIRE, NATURE, N° DU DROIT,
    TYPE DE CESSION, SIGNATURE DU CONTRAT."""
    rows = load_rows(fn, sheet)
    out = []
    for row in rows[1:]:
        if row[1] is None:  # exclut aussi la ligne pied-de-page "*VISA DT"
            continue
        cedant = clean(row[1])
        out.append({
            "annee": annee,
            "cedant": cedant,
            "entreprise_etat_cedant": is_soe(cedant),
            "cessionnaire": clean(row[2]),
            "nature": clean(row[3]),
            "numero_droit": clean(row[4]),
            "type_cession": clean(row[5]),
            "date_signature_contrat": clean(row[6]),
        })
    return out


def extract_amodiations(fn, sheet, annee):
    """REGISTRE DES AMODIATIONS DES DROITS MINIERS <année> (CAMI).
    Colonnes : N°, NOM DE L'AMODIANT, NOM DE L'AMODIATAIRE, NATURE,
    N° DU DROIT, TYPE D'AMODIATION, SIGNATURE DU CONTRAT, DATE INSCRIPTION.
    C'est précisément ce registre qui manquait au dernier Rapport ITIE selon
    le Secrétariat international ITIE (amodiations octroyées par des
    entreprises d'État telles que la Gécamines)."""
    rows = load_rows(fn, sheet)
    out = []
    for row in rows[1:]:
        if row[1] is None:  # exclut aussi la ligne pied-de-page "*VISA DT"
            continue
        amodiant = clean(row[1])
        out.append({
            "annee": annee,
            "amodiant": amodiant,
            "entreprise_etat_amodiant": is_soe(amodiant),
            "amodiataire": clean(row[2]),
            "nature": clean(row[3]),
            "numero_droit": clean(row[4]),
            "type_amodiation": clean(row[5]),
            "date_signature_contrat": clean(row[6]),
            "date_inscription": clean(row[7]),
        })
    return out


def extract_options(fn, sheet, annee):
    """REGISTRE DES CONTRATS D'OPTIONS <année> (CAMI).
    Colonnes : N°, NOM DU CEDANT, NOM DU CESSIONNAIRE, NATURE, N° DU DROIT,
    SIGNATURE DU CONTRAT."""
    rows = load_rows(fn, sheet)
    out = []
    for row in rows[1:]:
        if row[1] is None:  # exclut aussi la ligne pied-de-page "*VISA DT"
            continue
        cedant = clean(row[1])
        out.append({
            "annee": annee,
            "cedant": cedant,
            "entreprise_etat_cedant": is_soe(cedant),
            "cessionnaire": clean(row[2]),
            "nature": clean(row[3]),
            "numero_droit": clean(row[4]),
            "date_signature_contrat": clean(row[5]),
        })
    return out


def extract_permis_exploitation_octroi_2025(fn, sheet):
    """CAMI_REGISTRE DES PERMIS D'EXPLOITATION OCTROI-2025.
    Colonnes : N°, TITULAIRES, NATURE, PERMIS, STATUS, OCTROI, EXPIRATION,
    CARRES, LOCALISATION."""
    rows = load_rows(fn, sheet)
    out = []
    for row in rows[1:]:
        if row[0] is None:
            continue
        titulaire = clean(row[1])
        out.append({
            "annee": 2025,
            "titulaire": titulaire,
            "entreprise_etat": is_soe(titulaire),
            "nature": clean(row[2]),
            "numero_permis": clean(row[3]),
            "statut": clean(row[4]),
            "date_octroi": clean(row[5]),
            "date_expiration": clean(row[6]),
            "carres": row[7],
            "localisation": clean(row[8]),
        })
    return out


def extract_cession_parts_etat(fn):
    """REGISTRE DE CESSION EFFECTIVE DES PARTS À L'ÉTAT (10%, art. 71 du
    Code minier). Onglet « 10% » : liste des titulaires de PE en règle avec
    la cession de 10% du capital à l'État, avec les dates de la procédure
    (PV AGE, extrait RCCM, notification au ministère du Portefeuille)."""
    rows = load_rows(fn, "10%")
    out = []
    for row in rows[2:]:  # 2 lignes d'en-tête
        if row[2] is None:  # exclut aussi la ligne pied-de-page "Visa CD/DT"
            continue
        out.append({
            "titulaire": clean(row[2]),
            "date_pv_age": clean(row[3]),
            "numero_rccm": clean(row[4]),
            "date_extrait_rccm": clean(row[5]),
            "date_notification_min_portefeuille": clean(row[6]),
        })
    return out


def main():
    OUT_DIR.mkdir(exist_ok=True)

    octrois = (
        extract_octrois("2ce6ce0d-1790094566663_REGISTRE_DROITS_MINIERS_OCTOYES_EN_20231.xlsx", "DECEMBRE_2023", 2023)
        + extract_octrois("325f1e64-1790094566665_REGISTRE_DROITS_MINIERS_OCTOYES_EN_20221.xlsx", "DECEMBRE_2022", 2022)
    )
    cessions = (
        extract_cessions("f3af60bd-1790094566664_REGISTRE_DES_CESSIONS_DES_DROITS_MINIERS_2023.xlsx", "CESSION 2023", 2023)
        + extract_cessions("a0bce39f-1790094566664_REGISTRE_DES_CESSIONS_DES_DROITS_MINIERS_2022.xlsx", "CESSION 2022", 2022)
    )
    amodiations = extract_amodiations(
        "e91a8a35-1790094566664_REGISTRE_DES_AMODIATIONS_DES_DROITS_MINIERS_2023.xlsx", "AMODIATION 2023", 2023
    )
    options = extract_options(
        "b7c7e0b5-1790094566664_REGISTRE_DES_CONTRATS_DOPTIONS_20231.xlsx", "OPTIONS 2023", 2023
    )
    permis_2025 = extract_permis_exploitation_octroi_2025(
        "dec77db3-1790094782175_CAMI_REGISTRE_DES_PERMIS_DEXPLOITATION_OCTROI-2025.xlsx", "Licenses"
    )
    cession_parts_etat = extract_cession_parts_etat(
        "895f7d5e-1790094666678_REGISTRE_DE_CESSION_EFFECTIVE_DES_PARTS_A_LETAT.xlsx"
    )

    registres = {
        "meta": {
            "source": "Registres nationaux des droits miniers — transmis à l'ITIE-RDC",
            "note": (
                "Registres complémentaires au cadastre minier (carte des titres actifs) : "
                "octrois annuels, cessions, amodiations, contrats d'options et cession des "
                "parts de l'État, publiés pour répondre aux Exigences ITIE 2.2 et 2.3 et aux "
                "observations du Rapport de Validation ITIE (2022) sur l'absence de liste des "
                "amodiations et transferts effectués par les entreprises d'État."
            ),
        },
        "octrois": octrois,
        "cessions": cessions,
        "amodiations": amodiations,
        "options": options,
        "permis_exploitation_octroi_2025": permis_2025,
        "cession_parts_etat": cession_parts_etat,
    }

    out_path = OUT_DIR / "registres_droits_miniers.seed.json"
    out_path.write_text(json.dumps(registres, ensure_ascii=False, indent=1), encoding="utf-8")

    print("Écrit:", out_path)
    for k in ("octrois", "cessions", "amodiations", "options", "permis_exploitation_octroi_2025", "cession_parts_etat"):
        print(f"  {k}: {len(registres[k])} lignes")
    soe_amod = [a for a in amodiations if a["entreprise_etat_amodiant"]]
    soe_cess = [c for c in cessions if c["entreprise_etat_cedant"]]
    soe_opt = [o for o in options if o["entreprise_etat_cedant"]]
    print(f"  dont amodiations par une entreprise d'État: {len(soe_amod)}")
    print(f"  dont cessions par une entreprise d'État: {len(soe_cess)}")
    print(f"  dont contrats d'options par une entreprise d'État: {len(soe_opt)}")


if __name__ == "__main__":
    main()
