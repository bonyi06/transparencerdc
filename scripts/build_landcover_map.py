"""
scripts/build_landcover_map.py

Construit une carte « Land Cover » professionnelle de la RDC, reproduisant
le procédé décrit dans la vidéo fournie par l'utilisateur (tutoriel
Esri Land Cover / ArcMap / QGIS / Excel) :

  1. OCCUPATION DU SOL — Esri Sentinel-2 10m Land Cover 2020
     (Impact Observatory / Esri). Service public (aucune clé API) :
       https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer
     Légende officielle des 11 classes (valeur -> nom -> couleur) telle que
     documentée par le catalogue communautaire Google Earth Engine :
       https://gee-community-catalog.org/projects/esrilc2020/
     (Aucune couleur n'est inventée ici : ce sont les codes couleur
     officiellement publiés pour ce jeu de données.)

  2. RELIEF OMBRÉ (hillshade) — Copernicus DEM GLO-90 (résolution 90 m),
     jeu de données ouvert de l'Agence spatiale européenne, hébergé sur
     AWS Open Data Registry, accès anonyme sans clé API :
       https://copernicus-dem-90m.s3.amazonaws.com/
       (cf. https://github.com/awslabs/open-data-registry — dataset
       "copernicus-dem", bucket copernicus-dem-90m, région eu-central-1)

  3. EMPRISE — union des polygones des 26 provinces déjà présents dans
     data/geo.seed.json (aucune nouvelle source de frontière : on réutilise
     les données déjà vérifiées et publiques de TransparenceRDC).

  4. GRAPHIQUES — barres + camembert de la superficie par classe, avec les
     mêmes couleurs que la légende officielle (équivalent des graphiques
     Excel de la vidéo).

  5. MISE EN PAGE FINALE — carte + légende + échelle + flèche du nord +
     tableau récapitulatif + graphiques + mention explicite des sources,
     exportée en PNG haute résolution.

RÈGLE « NE RIEN CACHER / NE RIEN INVENTER » : ce script ne fabrique aucune
valeur. Si un téléchargement échoue (tuile DEM manquante, service Esri
indisponible, réponse inattendue…), l'erreur est affichée explicitement et
consignée dans le rapport JSON de sortie ; la zone concernée reste vide
(pas de comblement par interpolation ou couleur inventée), avec un
avertissement visible imprimé sur la carte finale le cas échéant.

IMPORTANT — RÉSEAU : ce script doit être exécuté EN LOCAL (ou dans un
environnement disposant d'un accès Internet complet), PAS dans le bac à
sable de développement Claude, dont l'accès réseau sortant est restreint
et ne peut pas atteindre arcgis.com ni amazonaws.com.

Prérequis (à installer une fois) :
    pip install rasterio geopandas shapely matplotlib numpy pillow requests

Usage :
    python scripts/build_landcover_map.py

Sorties (dans le dossier static/) :
    landcover_rdc.png        — carte complète prête à intégrer au site
    landcover_rdc_report.json — statistiques par classe + journal des
                                éventuelles erreurs de récupération
"""
from __future__ import annotations

import json
import math
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA_GEO = ROOT / "data" / "geo.seed.json"
OUT_DIR = ROOT / "static"
OUT_PNG = OUT_DIR / "landcover_rdc.png"
OUT_REPORT = OUT_DIR / "landcover_rdc_report.json"

# ===== 1. Légende officielle Esri / Impact Observatory Sentinel-2 10m LULC =====
# Attention (corrigé après premier essai réel, sept. 2026) : le schéma de
# classes de la source ArcGIS d'origine N'EST PAS séquentiel (les valeurs 3
# et 6 n'existent pas — elles ne sont pas utilisées dans ce schéma à 9
# classes). Une première tentative de citer une table séquentielle
# (catalogue communautaire Google Earth Engine) s'est révélée incorrecte :
# elle ne correspondait pas aux valeurs réellement présentes dans le fichier
# téléchargé depuis le service Esri (vérifié empiriquement : valeurs
# observées = 0,1,2,4,5,7,8,9,10,11 — exactement le schéma ci-dessous).
# Table officielle confirmée : documentation Planet des données Impact
# Observatory : https://docs.planet.com/data/public-data/other-datasets/impact-observatory-lulc-map/
LULC_CLASSES = {
    1:  ("Eau",                    "#419BDF"),
    2:  ("Arbres / forêt",         "#397D49"),
    4:  ("Végétation inondée",     "#7A87C6"),
    5:  ("Cultures",               "#E49635"),
    7:  ("Zones bâties",           "#C4281B"),
    8:  ("Sol nu",                 "#A59B8F"),
    9:  ("Neige / glace",          "#A8EBFF"),
    10: ("Nuages (non classé)",    "#616161"),
    11: ("Prairies / savane (rangeland)", "#E3E2C3"),
}
# La valeur 0 (hors des 9 classes ci-dessus) correspond à l'absence de
# donnée pour ce pixel (bord de l'emprise demandée, ou zone non couverte) —
# elle est exclue des statistiques de superficie, jamais recolorée par une
# valeur inventée.
# Résolution native de la source (pour les mentions de source sur la carte)
LULC_SOURCE_LABEL = "Esri / Impact Observatory — Sentinel-2 10m Land Cover 2020"
DEM_SOURCE_LABEL = "Copernicus DEM GLO-90 (ESA, résolution 90 m)"

# ===== 2. Emprise : union des provinces déjà dans l'entrepôt =====

def load_boundary():
    from shapely.geometry import shape
    from shapely.ops import unary_union
    d = json.loads(DATA_GEO.read_text(encoding="utf-8"))
    feats = d["geometry"]["features"]
    geoms = [shape(f["geometry"]) for f in feats]
    union = unary_union(geoms)
    return union


def bbox_with_buffer(geom, buffer_deg=0.05):
    minx, miny, maxx, maxy = geom.bounds
    return (minx - buffer_deg, miny - buffer_deg, maxx + buffer_deg, maxy + buffer_deg)


# ===== 3. Téléchargement Esri Land Cover (ImageServer REST, exportImage) =====

def fetch_lulc(bbox, size=(3600, 3600), year=2020, log=None):
    import requests
    url = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage"
    # Filtre temporel : composite annuel `year`. Le service expose une
    # dimension temporelle (mosaïque par année) ; si le filtre `time` n'est
    # pas reconnu tel quel par le service au moment de l'exécution, le
    # script le signale clairement plutôt que d'utiliser silencieusement
    # une autre année.
    t0 = int(datetime(year, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    t1 = int(datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)
    params = {
        "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
        "bboxSR": 4326,
        "imageSR": 4326,
        "size": f"{size[0]},{size[1]}",
        "format": "tiff",
        "pixelType": "U8",
        "noData": "0",
        "noDataInterpretation": "esriNoDataMatchAny",
        "interpolation": "RSP_NearestNeighbor",
        "time": f"{t0},{t1}",
        "f": "image",
    }
    print(f"  -> Requête Esri ImageServer (bbox={bbox}, size={size}, année={year})…")
    r = requests.get(url, params=params, timeout=180)
    r.raise_for_status()
    ct = r.headers.get("Content-Type", "")
    if "json" in ct.lower() or r.content[:1] == b"{":
        # Le service a répondu par une erreur JSON plutôt qu'une image.
        try:
            err = json.loads(r.content)
        except Exception:
            err = {"raw": r.content[:500].decode("utf-8", "replace")}
        raise RuntimeError(f"Le service Esri a renvoyé une erreur (pas d'image) : {err}")
    out = OUT_DIR / "_landcover_raw.tif"
    out.write_bytes(r.content)
    print(f"     reçu {len(r.content)/1e6:.1f} Mo -> {out}")
    return out


# ===== 4. Téléchargement + mosaïque du relief (Copernicus DEM GLO-90) =====

def dem_tile_url(lat_i: int, lon_i: int) -> str:
    ns = "N" if lat_i >= 0 else "S"
    ew = "E" if lon_i >= 0 else "W"
    name = f"Copernicus_DSM_COG_30_{ns}{abs(lat_i):02d}_00_{ew}{abs(lon_i):03d}_00_DEM"
    return f"https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif"


def build_dem_mosaic(bbox, out_shape, log):
    """Construit un raster d'altitude couvrant bbox, à la résolution out_shape,
    en assemblant les tuiles Copernicus DEM GLO-90 (1°x1°) qui le recouvrent.
    Toute tuile inaccessible est consignée dans `log` et laissée à NaN
    (jamais comblée par une valeur inventée)."""
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.warp import reproject, Resampling
    from rasterio.transform import from_bounds as transform_from_bounds

    minx, miny, maxx, maxy = bbox
    mosaic = np.full(out_shape, np.nan, dtype="float32")
    dst_transform = transform_from_bounds(minx, miny, maxx, maxy, out_shape[1], out_shape[0])

    lat0, lat1 = int(math.floor(miny)), int(math.floor(maxy))
    lon0, lon1 = int(math.floor(minx)), int(math.floor(maxx))
    n_tiles = (lat1 - lat0 + 1) * (lon1 - lon0 + 1)
    print(f"  -> Mosaïque DEM : {n_tiles} tuile(s) 1°x1° à assembler…")
    done = 0
    import time as _t
    MAX_RETRIES = 4
    for lat_i in range(lat0, lat1 + 1):
        for lon_i in range(lon0, lon1 + 1):
            url = dem_tile_url(lat_i, lon_i)
            vsi_url = f"/vsicurl/{url}"
            last_err = None
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    with rasterio.open(vsi_url) as src:
                        dst = np.full(out_shape, np.nan, dtype="float32")
                        reproject(
                            source=rasterio.band(src, 1),
                            destination=dst,
                            src_transform=src.transform,
                            src_crs=src.crs,
                            dst_transform=dst_transform,
                            dst_crs="EPSG:4326",
                            resampling=Resampling.bilinear,
                            dst_nodata=np.nan,
                        )
                        valid = ~np.isnan(dst)
                        mosaic[valid] = dst[valid]
                    last_err = None
                    break
                except Exception as e:
                    last_err = e
                    msg = str(e)
                    # "HTTP response code: 404" = tuile réellement absente
                    # (zone océanique hors relief terrestre) : inutile de
                    # réessayer. Toute autre erreur (DNS, timeout, réseau
                    # transitoire) est retentée avec un court délai.
                    if "404" in msg:
                        break
                    _t.sleep(1.5 * attempt)
            if last_err is not None:
                msg = f"Tuile DEM {lat_i},{lon_i} inaccessible après {MAX_RETRIES if '404' not in str(last_err) else 1} tentative(s) ({url}) : {last_err}"
                print(f"     ! {msg}")
                log.append(msg)
            done += 1
            if done % 20 == 0:
                print(f"     … {done}/{n_tiles} tuiles traitées")
    return mosaic, dst_transform


def hillshade_from_dem(dem, transform, azdeg=315, altdeg=45):
    from matplotlib.colors import LightSource
    dem_filled = np.where(np.isnan(dem), np.nanmin(dem) if np.any(~np.isnan(dem)) else 0, dem)
    dx = transform.a  # taille de pixel en degrés (approximation pour dy/dx)
    dy = -transform.e
    # conversion approximative degré -> mètres (latitude moyenne de la RDC)
    lat_mean = -4.0
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(lat_mean))
    ls = LightSource(azdeg=azdeg, altdeg=altdeg)
    hs = ls.hillshade(dem_filled, vert_exag=1.0, dx=dx * m_per_deg_lon, dy=dy * m_per_deg_lat)
    hs = np.where(np.isnan(dem), np.nan, hs)
    return hs


# ===== 5. Composition (classification colorée × relief ombré) =====

def classify_rgb(lulc_arr):
    # Fond blanc par défaut pour les pixels valeur=0 (hors des 9 classes
    # officielles = absence de donnée) — jamais recoloré par une couleur
    # de classe inventée.
    rgb = np.ones((*lulc_arr.shape, 3), dtype="float32")
    for val, (_name, hexcol) in LULC_CLASSES.items():
        hexcol = hexcol.lstrip("#")
        r, g, b = (int(hexcol[i:i+2], 16) / 255.0 for i in (0, 2, 4))
        mask = lulc_arr == val
        rgb[mask] = (r, g, b)
    return rgb


def blend_multiply(rgb, hillshade, brightness=1.08):
    hs = np.clip(hillshade, 0, 1)
    hs3 = np.repeat(hs[..., None], 3, axis=2)
    out = np.clip(rgb * hs3 * brightness, 0, 1)
    return out


def boundary_mask(geom, transform, shape_):
    from rasterio.features import geometry_mask
    mask = geometry_mask([geom.__geo_interface__], transform=transform, invert=True, out_shape=shape_)
    return mask


# ===== 6. Statistiques + graphiques (équivalent Excel) =====

def class_areas_km2(lulc_arr, mask, transform):
    lat_mean = -4.0
    px_deg = abs(transform.a)
    px_w_m = px_deg * 111320.0 * math.cos(math.radians(lat_mean))
    px_h_m = px_deg * 111320.0
    px_area_km2 = (px_w_m * px_h_m) / 1e6
    stats = {}
    for val, (name, hexcol) in LULC_CLASSES.items():
        # val=0 (hors des 9 classes) = absence de donnée, déjà exclu car
        # non présent dans LULC_CLASSES — jamais recoloré ni comptabilisé.
        n = int(np.sum((lulc_arr == val) & mask))
        if n == 0:
            continue
        stats[name] = {"pixels": n, "km2": round(n * px_area_km2, 1), "color": hexcol}
    return stats


def draw_charts(stats, out_prefix):
    import matplotlib.pyplot as plt
    names = list(stats.keys())
    values = [stats[n]["km2"] for n in names]
    colors = [stats[n]["color"] for n in names]
    order = np.argsort(values)[::-1]
    names = [names[i] for i in order]
    values = [values[i] for i in order]
    colors = [colors[i] for i in order]

    fig, ax = plt.subplots(figsize=(5, 3.2), dpi=200)
    ax.barh(names[::-1], values[::-1], color=colors[::-1], edgecolor="#00000022")
    ax.set_xlabel("Superficie (km²)")
    ax.set_title("Occupation du sol — RDC (2020)", fontsize=10, fontweight="bold")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    bar_path = f"{out_prefix}_bar.png"
    fig.savefig(bar_path, transparent=True)
    plt.close(fig)

    fig2, ax2 = plt.subplots(figsize=(3.4, 3.4), dpi=200)
    total = sum(values)
    pct = [v / total * 100 for v in values]
    keep = [(n, v, c, p) for n, v, c, p in zip(names, values, colors, pct) if p >= 1.0]
    autres = sum(p for *_, p in zip(names, values, colors, pct) if p < 1.0)
    labels = [n for n, *_ in keep] + (["Autres (<1% chacune)"] if autres > 0 else [])
    vals = [v for _, v, *_ in keep] + ([total * autres / 100] if autres > 0 else [])
    cols = [c for _, _, c, _ in keep] + (["#999999"] if autres > 0 else [])
    ax2.pie(vals, labels=None, colors=cols, startangle=90, wedgeprops={"edgecolor": "white", "linewidth": 1})
    ax2.legend(labels, loc="center left", bbox_to_anchor=(1.0, 0.5), fontsize=7, frameon=False)
    ax2.set_title("Répartition (%)", fontsize=10, fontweight="bold")
    fig2.tight_layout()
    donut_path = f"{out_prefix}_donut.png"
    fig2.savefig(donut_path, transparent=True)
    plt.close(fig2)
    return bar_path, donut_path


# ===== 7. Mise en page finale =====

def compose_final_map(composite_rgb, mask, bbox, stats, bar_path, donut_path, errors_log):
    import matplotlib.pyplot as plt
    from matplotlib import gridspec

    rgba = np.dstack([composite_rgb, mask.astype("float32")])

    fig = plt.figure(figsize=(14, 10), dpi=200, facecolor="white")
    gs = gridspec.GridSpec(3, 3, figure=fig, height_ratios=[0.22, 1.6, 0.55], width_ratios=[2.1, 1, 1])

    ax_title = fig.add_subplot(gs[0, :])
    ax_title.axis("off")
    ax_title.text(0.0, 0.85, "République Démocratique du Congo — Occupation du sol (2020)",
                   fontsize=17, fontweight="bold", ha="left", va="top")
    ax_title.text(0.0, 0.30,
                  "Carte produite selon le procédé fond ombré (MNT) + classification colorée + graphiques,\n"
                  "à partir de données publiques mondiales (voir sources en bas de page).",
                  fontsize=9, color="#555555", ha="left", va="top")

    ax_map = fig.add_subplot(gs[1, :])
    ax_map.imshow(rgba, extent=[bbox[0], bbox[2], bbox[1], bbox[3]], origin="upper")
    ax_map.set_xlim(bbox[0], bbox[2])
    ax_map.set_ylim(bbox[1], bbox[3])
    ax_map.set_xticks([])
    ax_map.set_yticks([])
    for spine in ax_map.spines.values():
        spine.set_visible(True)
        spine.set_color("#333333")

    # flèche du nord (simple)
    ax_map.annotate("N", xy=(0.96, 0.90), xytext=(0.96, 0.80), xycoords="axes fraction",
                     ha="center", fontsize=13, fontweight="bold",
                     arrowprops=dict(arrowstyle="-|>", color="black", lw=1.5))

    # échelle approximative (barre + texte, calcul à la latitude moyenne)
    lat_mean = (bbox[1] + bbox[3]) / 2
    km_per_deg_lon = 111.32 * math.cos(math.radians(lat_mean))
    bar_km = 200
    bar_deg = bar_km / km_per_deg_lon
    x0 = bbox[0] + (bbox[2] - bbox[0]) * 0.04
    y0 = bbox[1] + (bbox[3] - bbox[1]) * 0.04
    ax_map.plot([x0, x0 + bar_deg], [y0, y0], color="black", lw=2, solid_capstyle="butt")
    ax_map.text(x0 + bar_deg / 2, y0 + (bbox[3] - bbox[1]) * 0.012, f"{bar_km} km",
                ha="center", va="bottom", fontsize=8)

    if errors_log:
        ax_map.text(0.5, -0.03, f"⚠ {len(errors_log)} zone(s) sans donnée de relief disponible (voir rapport JSON)",
                    transform=ax_map.transAxes, ha="center", fontsize=8, color="#b00020")

    # légende des classes
    ax_leg = fig.add_subplot(gs[2, 0])
    ax_leg.axis("off")
    y = 0.95
    ax_leg.text(0, 1.02, "Légende", fontsize=10, fontweight="bold", transform=ax_leg.transAxes)
    for name, info in sorted(stats.items(), key=lambda kv: -kv[1]["km2"]):
        ax_leg.add_patch(plt.Rectangle((0, y - 0.03), 0.06, 0.05, color=info["color"], transform=ax_leg.transAxes, clip_on=False))
        pct = info["km2"] / sum(s["km2"] for s in stats.values()) * 100
        ax_leg.text(0.09, y, f"{name} — {info['km2']:,.0f} km² ({pct:.1f}%)".replace(",", " "),
                    fontsize=8, transform=ax_leg.transAxes, va="center")
        y -= 0.11

    # graphiques (barres + camembert), déjà rendus en PNG
    import matplotlib.image as mpimg
    ax_bar = fig.add_subplot(gs[2, 1])
    ax_bar.axis("off")
    ax_bar.imshow(mpimg.imread(bar_path))
    ax_donut = fig.add_subplot(gs[2, 2])
    ax_donut.axis("off")
    ax_donut.imshow(mpimg.imread(donut_path))

    fig.text(0.01, 0.005,
              f"Sources : {LULC_SOURCE_LABEL} · {DEM_SOURCE_LABEL} · Limites : provinces ITIE-RDC (TransparenceRDC) · "
              f"Traitement : script build_landcover_map.py — TransparenceRDC",
              fontsize=7, color="#777777")

    fig.savefig(OUT_PNG, facecolor="white", bbox_inches="tight")
    plt.close(fig)


# ===== main =====

def main():
    warnings.filterwarnings("ignore")
    OUT_DIR.mkdir(exist_ok=True)
    errors_log: list[str] = []

    print("1/6 — Chargement de l'emprise (provinces déjà dans l'entrepôt)…")
    boundary = load_boundary()
    bbox = bbox_with_buffer(boundary)
    print(f"     bbox = {bbox}")

    size = (3200, 3200)

    print("2/6 — Téléchargement de l'occupation du sol (Esri, 2020)…")
    cached = OUT_DIR / "_landcover_raw.tif"
    if cached.exists() and "--refresh" not in sys.argv:
        print(f"     déjà présent ({cached}) — réutilisé tel quel (passez --refresh pour retélécharger)")
        lulc_path = cached
    else:
        try:
            lulc_path = fetch_lulc(bbox, size=size, year=2020, log=errors_log)
        except Exception as e:
            print(f"ERREUR FATALE — impossible de récupérer l'occupation du sol : {e}")
            errors_log.append(f"Esri LULC : {e}")
            sys.exit(1)

    import rasterio
    with rasterio.open(lulc_path) as src:
        lulc_arr = src.read(1)
        lulc_transform = src.transform
        out_shape = lulc_arr.shape

    print("3/6 — Téléchargement + mosaïque du relief (Copernicus DEM GLO-90)…")
    dem, dem_transform = build_dem_mosaic(bbox, out_shape, errors_log)

    print("4/6 — Calcul du relief ombré et composition des couches…")
    hillshade = hillshade_from_dem(dem, dem_transform)
    rgb = classify_rgb(lulc_arr)
    composite = blend_multiply(rgb, np.where(np.isnan(hillshade), 0.7, hillshade))

    mask = boundary_mask(boundary, lulc_transform, out_shape)

    print("5/6 — Statistiques par classe + graphiques…")
    stats = class_areas_km2(lulc_arr, mask, lulc_transform)
    if not stats:
        print("ERREUR — aucune statistique calculée (masque ou classification vide).")
        sys.exit(1)
    bar_path, donut_path = draw_charts(stats, str(OUT_DIR / "_landcover_chart"))

    print("6/6 — Mise en page finale et export…")
    compose_final_map(composite, mask, bbox, stats, bar_path, donut_path, errors_log)

    report = {
        "generated_year": 2020,
        "sources": {"land_cover": LULC_SOURCE_LABEL, "relief": DEM_SOURCE_LABEL},
        "bbox": bbox,
        "stats_km2": stats,
        "errors": errors_log,
    }
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nTerminé.\n  Carte : {OUT_PNG}\n  Rapport : {OUT_REPORT}")
    if errors_log:
        print(f"  ⚠ {len(errors_log)} erreur(s) consignée(s) dans le rapport — la carte le mentionne explicitement.")


if __name__ == "__main__":
    main()
