#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Reconstruit entierement les donnees "Cahiers des charges" de la page
Geographie a partir de la nouvelle matrice BI (Haut-Katanga & Lualaba)
fournie par l'utilisateur (rapport + matrice Excel, septembre 2026).

Remplace les anciennes couches cahiers_2021_entreprises / cahiers_2021_budget
(issues du seul resume administratif de mai 2022, Haut-Katanga, 14 entreprises)
par deux couches beaucoup plus riches couvrant 54 cahiers (41 Haut-Katanga
extraits document par document + 13 Lualaba inventories), avec points
geolocalises par entreprise (Haut-Katanga, territoire connu) et liste
explicitement non geolocalisee pour le Lualaba (territoire non precise dans
la source), conformement au principe "ne rien cacher" deja applique a la
page Hydrocarbures (bloc CC7).

Usage: python3 scripts/build_cahiers_hklu.py
"""
import json
import math
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = Path("/root/.claude/uploads/73d4ced1-cb7c-5359-a313-8942c78c9061/a8a54777-Matrice_BI_Cahiers_des_charges_Katanga_Lualaba.xlsx")
GEO_PATH = ROOT / "data" / "geo.seed.json"
WH_PATH = ROOT / "data" / "warehouse.seed.json"

TERR_NORM = {
    "Ville de Likasi": "Likasi",
    "Ville de Lubumbashi": "Lubumbashi",
}

SECTEUR_LABELS = ["Éducation", "Santé", "Eau", "Électricité", "Routes/Voirie", "Ponts",
                  "Assainissement", "Agriculture", "Élevage/Pisciculture",
                  "Bâtiments communautaires", "Sport/Loisirs", "Autre"]


def load_entreprises():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["Entreprises"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    out = []
    for r in rows:
        prov = r[0]
        if prov not in ("Haut-Katanga", "Lualaba"):
            continue  # skip TOTAL rows
        terr = r[5]
        if terr in TERR_NORM:
            terr = TERR_NORM[terr]
        out.append({
            "province": prov,
            "entreprise": r[1],
            "fichier": r[2],
            "date_source": r[3],
            "annee": r[4],
            "territoire": terr,
            "groupement": r[6],
            "nb_communautes": r[7],
            "communautes": r[8],
            "duree": r[9],
            "budget": r[10],
            "nb_projets": r[11],
            "temoin": r[12],
            "titres": r[13],
            "observations": r[14],
        })
    return out


def load_projets():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["Projets"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    out = []
    for r in rows:
        if r[0] not in ("Haut-Katanga", "Lualaba"):
            continue
        out.append({
            "province": r[0], "entreprise": r[1], "territoire": r[2],
            "description": r[3], "secteur_doc": r[4], "secteur_norm": r[5],
            "budget": r[6], "annees": r[7],
        })
    return out


def polygon_centroid(coords_rings):
    """Simple area-weighted centroid of the outer ring of a (multi)polygon (approx, WGS84 planar)."""
    ring = coords_rings[0]
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    a *= 0.5
    if abs(a) < 1e-12:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    cx /= (6 * a)
    cy /= (6 * a)
    return cx, cy


def feature_centroid(feat):
    geom = feat["geometry"]
    if geom["type"] == "Polygon":
        return polygon_centroid(geom["coordinates"])
    if geom["type"] == "MultiPolygon":
        # use the largest ring by vertex count as a simple proxy for the main landmass
        polys = geom["coordinates"]
        biggest = max(polys, key=lambda p: len(p[0]))
        return polygon_centroid(biggest)
    raise ValueError(geom["type"])


def main():
    geo = json.loads(GEO_PATH.read_text(encoding="utf-8"))
    wh = json.loads(WH_PATH.read_text(encoding="utf-8"))

    terr_centroid = {}
    for f in geo["terr_geom"]["features"]:
        nom, iso = f["properties"]["nom"], f["properties"]["prov_iso"]
        terr_centroid[(iso, nom)] = feature_centroid(f)

    entreprises = load_entreprises()
    projets = load_projets()

    # --- items (top secteurs) par entreprise, a partir des projets budgetises ---
    by_ent_secteur = {}
    for p in projets:
        if p["budget"] is None:
            continue
        key = (p["province"], p["entreprise"])
        sec = p["secteur_norm"] or "Autre"
        by_ent_secteur.setdefault(key, {}).setdefault(sec, 0.0)
        by_ent_secteur[key][sec] += p["budget"]

    def top_items(prov, ent, n=3):
        d = by_ent_secteur.get((prov, ent), {})
        items = sorted(({"e": s, "f": "Secteur (projets budgétisés)", "v": v} for s, v in d.items()),
                        key=lambda x: -x["v"])
        return items[:n], items

    # --- construit points geolocalises (Haut-Katanga uniquement, territoire connu) ---
    HK_ISO = "CD-HK"
    LU_ISO = "CD-LU"
    jitter_count = {}
    points_by_year = {}
    prov_by_year_budget = {}
    prov_by_year_nombre = {}
    terr_by_year_budget = {}
    terr_by_year_nombre = {}
    lualaba_list = []
    hk_no_year = []

    for e in entreprises:
        year_key = str(e["annee"]) if e["annee"] else "s.d."
        prov_iso = HK_ISO if e["province"] == "Haut-Katanga" else LU_ISO
        budget = e["budget"] or 0
        prov_by_year_budget.setdefault(year_key, {}).setdefault(prov_iso, 0)
        prov_by_year_budget[year_key][prov_iso] += budget
        prov_by_year_nombre.setdefault(year_key, {}).setdefault(prov_iso, 0)
        prov_by_year_nombre[year_key][prov_iso] += 1

        if e["province"] == "Haut-Katanga":
            if e["annee"] is None:
                hk_no_year.append(e["entreprise"])
            tkey = (HK_ISO, e["territoire"])
            terr_key = f"{HK_ISO}|{e['territoire']}"
            terr_by_year_budget.setdefault(year_key, {}).setdefault(terr_key, 0)
            terr_by_year_budget[year_key][terr_key] += budget
            terr_by_year_nombre.setdefault(year_key, {}).setdefault(terr_key, 0)
            terr_by_year_nombre[year_key][terr_key] += 1

            base_lng, base_lat = terr_centroid.get(tkey, (None, None))
            if base_lng is None:
                continue
            n = jitter_count.get(tkey, 0)
            jitter_count[tkey] = n + 1
            # petite spirale deterministe pour separer visuellement les entreprises d'un meme territoire
            ang = n * 2.399963
            rad = 0.045 * math.sqrt(n)
            lng = base_lng + rad * math.cos(ang)
            lat = base_lat + rad * math.sin(ang) * 0.85
            top3, all_items = top_items(e["province"], e["entreprise"])
            pt = {
                "nom": e["entreprise"], "lng": round(lng, 5), "lat": round(lat, 5),
                "prov_iso": HK_ISO, "terr": e["territoire"], "v": budget,
                "items": top3,
                "annee": e["annee"], "fichier": e["fichier"], "date_source": e["date_source"],
                "groupement": e["groupement"], "nb_communautes": e["nb_communautes"],
                "communautes": e["communautes"], "duree": e["duree"],
                "nb_projets": e["nb_projets"], "nb_projets_budgetises": len(all_items) and sum(1 for p in projets if p["province"]==e["province"] and p["entreprise"]==e["entreprise"] and p["budget"] is not None),
                "temoin": e["temoin"], "titres": e["titres"], "observations": e["observations"],
                "position_note": "Position approximative : centroïde du territoire déclaré (aucune coordonnée précise du site communautaire dans la source).",
            }
            points_by_year.setdefault(year_key, []).append(pt)
        else:
            lualaba_list.append({
                "entreprise": e["entreprise"], "annee": e["annee"], "budget": e["budget"],
                "nb_projets": e["nb_projets"], "duree": e["duree"], "observations": e["observations"],
            })

    # "s.d." (annee de signature inconnue) en tete de liste plutot qu'en fin,
    # pour que l'annee par defaut affichee (la derniere de la liste) soit une
    # vraie annee recente et non ce libelle de repli.
    years_sorted = sorted(prov_by_year_budget.keys(), key=lambda y: (y != "s.d.", y))

    def build_layer(prov_data, terr_data, label, unit, fmt):
        return {
            "label": label, "unit": unit, "fmt": fmt,
            "years": years_sorted,
            "prov": {y: prov_data.get(y, {}) for y in years_sorted},
            "terr": {y: terr_data.get(y, {}) for y in years_sorted},
            "points": {y: points_by_year.get(y, []) for y in years_sorted},
            "lualaba_list": lualaba_list,
            "hk_no_year": hk_no_year,
        }

    layers = geo["layers"]
    layers.pop("cahiers_2021_entreprises", None)
    layers.pop("cahiers_2021_budget", None)
    layers["cahiers_hklu_budget"] = build_layer(
        prov_by_year_budget, terr_by_year_budget,
        "Cahiers de charge — budget total engagé (Haut-Katanga & Lualaba, 2020-2024)",
        "USD", "usd")
    layers["cahiers_hklu_nombre"] = build_layer(
        prov_by_year_nombre, terr_by_year_nombre,
        "Cahiers de charge — nombre de cahiers signés (Haut-Katanga & Lualaba, 2020-2024)",
        "cahiers", "num")

    GEO_PATH.write_text(json.dumps(geo, ensure_ascii=False, indent=1), encoding="utf-8")

    # --- tables brutes (transparence, Explorateur / Modele de donnees) ---
    ent_cols = ["Province", "Entreprise", "Fichier source", "Date / chronogramme source", "Année",
                "Territoire / Ville (principal)", "Groupement / Secteur / Commune", "Nb communautés",
                "Communautés bénéficiaires", "Durée / chronogramme", "Budget total (USD)", "Nb projets",
                "Témoin / garant", "Titres miniers", "Observations"]
    ent_types = ["str", "str", "str", "str", "num", "str", "str", "num", "str", "str", "num", "num",
                 "str", "str", "str"]
    ent_rows = [[e["province"], e["entreprise"], e["fichier"], e["date_source"], e["annee"], e["territoire"],
                 e["groupement"], e["nb_communautes"], e["communautes"], e["duree"], e["budget"],
                 e["nb_projets"], e["temoin"], e["titres"], e["observations"]] for e in entreprises]

    proj_cols = ["Province", "Entreprise", "Territoire du projet", "Description du projet",
                 "Secteur (document)", "Secteur (normalisé)", "Budget (USD)", "Années"]
    proj_types = ["str", "str", "str", "str", "str", "str", "num", "str"]
    proj_rows = [[p["province"], p["entreprise"], p["territoire"], p["description"], p["secteur_doc"],
                  p["secteur_norm"], p["budget"], p["annees"]] for p in projets]

    wh["datasets"]["geo_cahiers_hklu_entreprises"] = {
        "label": "Cahiers des charges Haut-Katanga & Lualaba — synthèse par entreprise (2026)",
        "desc": "Synthèse, entreprise par entreprise, des 54 cahiers des charges de responsabilité sociétale recensés dans le Haut-Katanga (41 cahiers dépouillés document par document, dossier « Cahiers des charges Haut-Katanga ») et au Lualaba (13 cahiers inventoriés à partir du « Résumé des cahiers des charges KATANGA et LUALABA » de juin 2022, granularité moindre : budget par entreprise uniquement, pas de territoire). Remplace, pour la carte « Géographie », l'ancien jeu de données limité au seul résumé de mai 2022 (14 entreprises du Haut-Katanga).",
        "cat": "contextuel",
        "cols": ent_cols, "types": ent_types, "rows": ent_rows,
        "meta": {
            "periode": "Cahiers signés entre 2020 et 2024 (Haut-Katanga) ; inventaire administratif de juin 2022 (Lualaba)",
            "unite": "USD (budget total engagé) ; voir les autres colonnes pour les unités propres",
            "devise": "USD",
            "source": "Dossier « Cahiers des charges Haut-Katanga » (41 documents scannés, lecture visuelle page par page ; CHEMAF et CDM intégrés depuis une analyse OCR fournie séparément, réconciliés au centime) et « Résumé des cahiers des charges KATANGA et LUALABA » de juin 2022 (13 entreprises du Lualaba, budgets au niveau entreprise). Rapport de synthèse joint : « Cahiers des charges des entreprises minières du Haut-Katanga et du Lualaba » (septembre 2026).",
            "perimetre": "54 cahiers des charges de responsabilité sociétale en cours (Code minier révisé de 2018) : 41 au Haut-Katanga (118 000 164,33 USD, 474 projets) et 13 au Lualaba (58 194 515 USD sur 12 chiffrés, SICOMINES non chiffrée, 212 projets décrits). Ne couvre pas les autres provinces minières.",
            "desagregation": "entreprise, province, territoire (Haut-Katanga uniquement — non détaillé dans la source pour le Lualaba), année de signature",
            "qualite": "Extraction Haut-Katanga recoupée avec les récapitulatifs administratifs de mai/juin 2022 (9 montants concordants, dont CHEMAF au centime et Frontier à l'unité) ; écarts résiduels documentés dans le rapport (généralement < 0,1 %, imputables à la qualité des scans). 5 entreprises du Haut-Katanga sans date de signature lisible (année non renseignée ci-dessous, jamais devinée). Les 13 entreprises du Lualaba proviennent d'une source de granularité moindre (pas de budget par projet, territoire non précisé) — SICOMINES y est recensée sans budget chiffré, publiée telle quelle plutôt que masquée.",
        },
    }
    wh["datasets"]["geo_cahiers_hklu_projets"] = {
        "label": "Cahiers des charges Haut-Katanga & Lualaba — détail des projets (2026)",
        "desc": "Détail des projets d'infrastructures et de développement communautaire financés par les cahiers des charges du Haut-Katanga (474 projets, dont 469 budgétisés ligne à ligne) et du Lualaba (198 projets décrits, sans budget par projet dans la source administrative de juin 2022). Secteurs normalisés en 12 catégories pour permettre les agrégations transversales (voir rapport joint).",
        "cat": "contextuel",
        "cols": proj_cols, "types": proj_types, "rows": proj_rows,
        "meta": {
            "periode": "Chronogrammes 2020-2029 selon les cahiers",
            "unite": "USD (budget par projet, Haut-Katanga uniquement)",
            "devise": "USD",
            "source": "Mêmes documents que la table « synthèse par entreprise » (voir ci-dessus) ; secteurs normalisés en 12 catégories : " + ", ".join(SECTEUR_LABELS) + ".",
            "perimetre": "672 projets recensés (474 Haut-Katanga + 198 Lualaba) ; budget par projet renseigné pour le Haut-Katanga uniquement (469 des 474 projets).",
            "desagregation": "entreprise, secteur normalisé, territoire du projet (Haut-Katanga)",
            "qualite": "Descriptions reprises telles quelles depuis les tableaux d'engagements sources ; pour le Lualaba, secteur normalisé déduit de la description faute de code sectoriel dans la source administrative.",
        },
    }
    WH_PATH.write_text(json.dumps(wh, ensure_ascii=False, indent=1), encoding="utf-8")

    print("OK — entreprises:", len(entreprises), "| projets:", len(projets),
          "| points HK geolocalises:", sum(len(v) for v in points_by_year.values()),
          "| Lualaba non geolocalisees:", len(lualaba_list),
          "| HK sans annee:", hk_no_year,
          "| annees:", years_sorted)
    tot_budget_hk = sum(v for y in prov_by_year_budget.values() for k, v in y.items() if k == HK_ISO)
    tot_budget_lu = sum(v for y in prov_by_year_budget.values() for k, v in y.items() if k == LU_ISO)
    print("Total budget HK:", tot_budget_hk, "| Total budget LU:", tot_budget_lu)


if __name__ == "__main__":
    main()
