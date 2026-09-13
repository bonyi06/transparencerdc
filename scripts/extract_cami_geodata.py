"""
Extraction des données géographiques publiques du portail cadastral minier
de la CAMI (drclicences.cami.cd), pour servir d'inspiration / de source de
données à une future amélioration de la page « Géographie » de
TransparenceRDC.

Contexte
--------
Le portail CAMI (https://drclicences.cami.cd/) est construit sur ArcGIS et
expose ses données via des « Feature Services » REST publics (pas
d'authentification requise), à l'adresse de base :

    https://services1.arcgis.com/AYIukXzftCPbklHN/arcgis/rest/services/

Ce script :
  1. interroge chaque service listé dans SERVICES ci-dessous pour découvrir
     dynamiquement la liste réelle de ses couches (« layers ») — on ne
     suppose jamais un nombre de sous-couches, on le lit à chaque fois sur
     `{service}/FeatureServer?f=json` ;
  2. pour chaque couche, télécharge TOUS les enregistrements par pages de
     1000 (limite du serveur) en utilisant `resultOffset` / `resultRecordCount`,
     en vérifiant le drapeau `exceededTransferLimit` pour ne rien manquer ;
  3. convertit chaque géométrie Esri JSON (rings / paths / x,y) en GeoJSON
     standard ;
  4. écrit un fichier GeoJSON (FeatureCollection) par couche dans le dossier
     de sortie, plus un fichier `manifest.json` récapitulant le nombre
     d'entités par couche et les champs (attributs) disponibles.

Usage
-----
    python scripts/extract_cami_geodata.py

    (aucune dépendance externe : seule la bibliothèque standard Python est
    utilisée, exprès, pour pouvoir tourner tel quel dans le Shell Render.)

Le résultat est écrit dans `cami_geodata_output/` (créé à la racine du
projet). Une fois le script terminé, zippez ce dossier et transmettez-le
pour intégration dans TransparenceRDC :

    cd cami_geodata_output && zip -r ../cami_geodata_output.zip . && cd ..

Important — respect de la règle « ne rien cacher / ne rien inventer » :
ce script ne modifie, ne filtre ni ne « corrige » aucune valeur : il
recopie telles quelles les géométries et tous les attributs (`outFields=*`)
renvoyés par le portail officiel CAMI. Si une requête échoue après
plusieurs tentatives, la couche concernée est marquée en erreur dans le
manifeste plutôt que d'être silencieusement omise.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://services1.arcgis.com/AYIukXzftCPbklHN/arcgis/rest/services"

# Services confirmés publiquement accessibles sur le portail CAMI lors de
# l'exploration préalable (voir échanges précédents). On y ajoute une
# petite marge de tolérance : si l'un de ces noms de service n'existe plus
# ou renvoie une erreur, le script le signale dans le manifeste et continue
# avec les autres, sans jamais s'arrêter en cours de route.
SERVICES = [
    "DRCPortal_GeologyLayer",
    "DRCPortal_AdminLayer",
    "DRCPortal_OthersLayer_1a",
    "DRCPortal_ApplicationLayer_1",
    "DRCPortal_ActiveExplorationLayer_1",
    "DRCPortal_ActiveExploitationLayer_1",
]

OUT_DIR = Path(__file__).resolve().parent.parent / "cami_geodata_output"
PAGE_SIZE = 1000
TIMEOUT = 60
MAX_RETRIES = 4
USER_AGENT = "TransparenceRDC-extraction-script/1.0 (usage ponctuel, donnees publiques)"


def _http_get_json(url: str, params: dict) -> dict:
    qs = urllib.parse.urlencode(params)
    full_url = f"{url}?{qs}"
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(full_url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read()
            return json.loads(raw.decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            last_err = e
            wait = 2 * attempt
            print(f"    ! tentative {attempt}/{MAX_RETRIES} échouée ({e}) — nouvel essai dans {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"Échec définitif après {MAX_RETRIES} tentatives sur {url} : {last_err}")


def discover_layers(service: str) -> list[dict]:
    """Lit les métadonnées du service pour obtenir la liste réelle de ses
    couches (id, name, type de géométrie), sans supposer aucun intervalle
    de sous-couches à l'avance."""
    meta = _http_get_json(f"{BASE}/{service}/FeatureServer", {"f": "json"})
    layers = meta.get("layers", []) or []
    tables = meta.get("tables", []) or []
    return layers + tables


def esri_ring_signed_area(ring: list[list[float]]) -> float:
    area = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        area += (x1 * y2 - x2 * y1)
    return area / 2.0


def esri_polygon_to_geojson(rings: list[list[list[float]]]):
    """Regroupe les anneaux Esri (rings) en polygones GeoJSON.
    Convention Esri classique : un anneau extérieur a une aire signée
    négative (sens horaire), un anneau intérieur (trou) une aire positive
    (sens antihoraire). On regroupe chaque trou avec le dernier anneau
    extérieur rencontré. En cas de géométrie inhabituelle, on ne perd
    aucun anneau : tout anneau orphelin est traité comme un polygone à
    part entière plutôt qu'ignoré."""
    polygons: list[list[list[list[float]]]] = []
    current: list[list[list[float]]] | None = None
    for ring in rings:
        area = esri_ring_signed_area(ring)
        if area < 0 or current is None:
            current = [ring]
            polygons.append(current)
        else:
            current.append(ring)
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def esri_geometry_to_geojson(geom: dict | None, geometry_type: str):
    if not geom:
        return None
    if "rings" in geom:
        return esri_polygon_to_geojson(geom["rings"])
    if "paths" in geom:
        paths = geom["paths"]
        if len(paths) == 1:
            return {"type": "LineString", "coordinates": paths[0]}
        return {"type": "MultiLineString", "coordinates": paths}
    if "x" in geom and "y" in geom:
        return {"type": "Point", "coordinates": [geom["x"], geom["y"]]}
    if "points" in geom:
        return {"type": "MultiPoint", "coordinates": geom["points"]}
    print(f"    ! type de géométrie non reconnu pour {geometry_type} : clés={list(geom.keys())}")
    return None


def fetch_all_features(service: str, layer_id: int) -> tuple[list[dict], str | None]:
    """Pagine sur /query jusqu'à épuisement. Renvoie (features_geojson, erreur)."""
    query_url = f"{BASE}/{service}/FeatureServer/{layer_id}/query"
    all_features: list[dict] = []
    offset = 0
    geometry_type = None
    while True:
        params = {
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "f": "json",
            "outSR": 4326,
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
        }
        try:
            data = _http_get_json(query_url, params)
        except RuntimeError as e:
            return all_features, str(e)

        if "error" in data:
            return all_features, json.dumps(data["error"], ensure_ascii=False)

        geometry_type = data.get("geometryType", geometry_type)
        feats = data.get("features", [])
        for f in feats:
            geom = esri_geometry_to_geojson(f.get("geometry"), geometry_type or "")
            all_features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": f.get("attributes", {}),
            })

        print(f"    ... {layer_id} : {len(all_features)} entités récupérées (page de {len(feats)})")

        if len(feats) < PAGE_SIZE and not data.get("exceededTransferLimit"):
            break
        if not feats:
            break
        offset += PAGE_SIZE

    return all_features, None


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    manifest = {"generated_by": "scripts/extract_cami_geodata.py", "services": {}}

    for service in SERVICES:
        print(f"\n=== Service : {service} ===")
        try:
            layers = discover_layers(service)
        except RuntimeError as e:
            print(f"  ! Impossible de lire les métadonnées du service : {e}")
            manifest["services"][service] = {"error": str(e)}
            continue

        manifest["services"][service] = {"layers": {}}

        for layer in layers:
            layer_id = layer.get("id")
            layer_name = layer.get("name", f"layer_{layer_id}")
            print(f"  -- Couche {layer_id} : {layer_name}")

            features, err = fetch_all_features(service, layer_id)
            safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in layer_name)
            out_path = OUT_DIR / f"{service}__{layer_id}__{safe_name}.geojson"

            fc = {"type": "FeatureCollection", "features": features}
            out_path.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

            field_names = sorted({
                k for feat in features[:50] for k in feat["properties"].keys()
            })

            manifest["services"][service]["layers"][str(layer_id)] = {
                "name": layer_name,
                "geometry_type": layer.get("geometryType"),
                "feature_count": len(features),
                "sample_fields": field_names,
                "output_file": out_path.name,
                "error": err,
            }
            status = f"ERREUR: {err}" if err else "OK"
            print(f"     -> {len(features)} entités écrites dans {out_path.name} [{status}]")

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nTerminé. Résultats dans : {OUT_DIR}")
    print(f"Manifeste récapitulatif : {manifest_path}")


if __name__ == "__main__":
    main()
