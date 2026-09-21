"""
Bande de cours des matières premières (page « Vue d'ensemble »).

Contexte / choix de source — voir aussi le journal des modifications
(À propos) : l'utilisateur a demandé une bande affichant chaque matin les
cours du cuivre, cobalt, or, diamant, pétrole, zinc, étain, lithium, etc.,
en s'appuyant sur « un marché des matières premières fiable comme LME ».
Vérification faite : le London Metal Exchange ne propose aucune API
publique gratuite — l'accès à ses prix officiels nécessite un abonnement
payant (LMElive ou un distributeur agréé). Le fournisseur retenu ici,
MetalpriceAPI (https://metalpriceapi.com), reprend notamment les cours du
LME/COMEX/NYMEX pour les métaux et de l'ICE/NYMEX pour le pétrole, et
propose un plan gratuit (100 requêtes/mois, mise à jour quotidienne) —
largement suffisant pour un relevé une fois par jour (~30 requêtes/mois).
L'utilisateur peut à tout moment passer à un plan payant du même
fournisseur s'il souhaite des mises à jour plus fréquentes ; rien ne
l'impose pour l'usage prévu ici.

Le diamant est volontairement absent de la liste ci-dessous : il n'existe
pas de cours de marché coté et standardisé pour le diamant (contrairement
aux métaux et au pétrole, qui se négocient sur des bourses à terme) — les
indices existants (Rapaport, IDEX...) sont propriétaires, payants, et non
un « prix » unique (ils varient par taille/pureté/couleur). Plutôt que
d'inventer ou d'approximer une valeur, cette absence est déclarée
explicitement dans l'interface (voir serialize_prices() ci-dessous et
static/app.js, commodityTickerSection()), conformément au principe
« ne rien cacher » du site.

Fonctionnement : un relevé est effectué au plus une fois par jour (à la
première requête /api/commodity-prices de la journée), puis mis en cache
en base (table commodity_price_cache). En cas d'échec (clé absente, quota
dépassé, panne du fournisseur, symbole non couvert par l'offre
souscrite...), la dernière valeur connue reste affichée avec sa date et un
message d'erreur explicite — jamais de valeur inventée ou recalculée à
partir d'une hypothèse.
"""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, timezone

import requests

from models import CommodityPriceCache, SiteContent, db

METALPRICEAPI_URL = "https://api.metalpriceapi.com/v1/latest"

# Symboles demandés par l'utilisateur, dans l'ordre d'affichage souhaité.
# Libellé et unité repris tels que documentés par MetalpriceAPI
# (metalpriceapi.com/currencies) — affichés tels quels plutôt que reconvertis,
# pour rester fidèles à ce que la source publie réellement (les métaux de
# base y sont cotés à l'once, et non à la tonne comme l'affiche usuellement
# le LME lui-même : voir la note affichée à côté de la bande côté public).
SYMBOLS = [
    {"symbol": "XAU", "label": "Or", "unit": "once troy"},
    {"symbol": "XCU", "label": "Cuivre", "unit": "once"},
    {"symbol": "XCO", "label": "Cobalt", "unit": "once"},
    {"symbol": "ZNC", "label": "Zinc", "unit": "once"},
    {"symbol": "XSN", "label": "Étain", "unit": "once"},
    {"symbol": "XLI", "label": "Lithium", "unit": "once"},
    {"symbol": "NI", "label": "Nickel", "unit": "once"},
    {"symbol": "WTI", "label": "Pétrole (WTI)", "unit": "baril"},
    {"symbol": "BRENT", "label": "Pétrole (Brent)", "unit": "baril"},
]
SYMBOL_CODES = [s["symbol"] for s in SYMBOLS]

EXCLUDED = [
    {
        "label": "Diamant",
        "reason": (
            "Aucun cours de marché coté et standardisé n'existe pour le "
            "diamant (contrairement aux métaux et au pétrole, négociés sur "
            "des bourses à terme) : les indices propriétaires existants "
            "(Rapaport, IDEX...) sont payants et varient par taille/pureté/"
            "couleur plutôt que de donner un prix unique. Il n'est donc pas "
            "repris ici, plutôt que d'afficher une valeur approximative."
        ),
    }
]


def _get_api_key() -> str:
    sc = SiteContent.singleton()
    integrations = (sc.content or {}).get("integrations", {}) or {}
    return (integrations.get("commodity_api_key") or "").strip()


def _fetch_from_provider() -> tuple[dict | None, str | None]:
    """Interroge MetalpriceAPI. Ne renvoie jamais de valeur reconstituée :
    soit les cours réellement renvoyés par le fournisseur, soit None avec un
    message d'erreur explicite."""
    key = _get_api_key()
    if not key:
        return None, (
            "Aucune clé API MetalpriceAPI n'est configurée "
            "(mode administrateur > Vue d'ensemble > Bande des cours)."
        )
    try:
        resp = requests.get(
            METALPRICEAPI_URL,
            params={"api_key": key, "base": "USD", "currencies": ",".join(SYMBOL_CODES)},
            timeout=12,
        )
    except requests.RequestException as exc:
        return None, f"Erreur réseau lors de l'appel à MetalpriceAPI : {exc}"
    try:
        payload = resp.json()
    except ValueError:
        return None, f"Réponse illisible de MetalpriceAPI (HTTP {resp.status_code})."
    if not payload.get("success"):
        err = payload.get("error") or {}
        info = err.get("info") or err.get("message") or str(err) or f"HTTP {resp.status_code}"
        return None, f"MetalpriceAPI a renvoyé une erreur : {info}"

    raw_rates = payload.get("rates") or {}
    prices: dict[str, float] = {}
    missing: list[str] = []
    for entry in SYMBOLS:
        sym = entry["symbol"]
        # MetalpriceAPI renvoie le prix direct sous la clé "USD<SYMBOLE>"
        # (ex: "USDXAU") et son inverse sous la clé "<SYMBOLE>" seule (voir
        # la documentation officielle). On ne calcule jamais un prix à
        # partir d'une hypothèse non vérifiée : si aucune des deux formes
        # attendues n'est présente pour un symbole, il est simplement
        # signalé comme manquant plutôt que remplacé par une estimation.
        direct_key = f"USD{sym}"
        if direct_key in raw_rates and raw_rates[direct_key]:
            prices[sym] = raw_rates[direct_key]
        elif sym in raw_rates and raw_rates[sym]:
            try:
                prices[sym] = 1.0 / raw_rates[sym]
            except ZeroDivisionError:
                missing.append(sym)
        else:
            missing.append(sym)

    if not prices:
        return None, (
            "MetalpriceAPI a répondu sans qu'aucun des symboles attendus ne "
            "soit reconnu (offre souscrite trop limitée, ou format de "
            "réponse inattendu) : " + str(raw_rates)[:300]
        )
    return {"prices": prices, "missing": missing}, None


def get_prices(force: bool = False) -> CommodityPriceCache:
    """Renvoie le cache des cours, en le rafraîchissant au plus une fois par
    jour (sauf `force=True`, utilisé par le bouton admin « Rafraîchir
    maintenant »)."""
    cache = CommodityPriceCache.singleton()
    today = date_cls.today().isoformat()
    if not force and cache.date == today and cache.rates:
        return cache

    result, err = _fetch_from_provider()
    if result is not None:
        if cache.date and cache.date != today and cache.rates:
            cache.prev_date = cache.date
            cache.prev_rates = cache.rates
        cache.date = today
        cache.rates = result["prices"]
        cache.missing_symbols = result["missing"]
        cache.provider = "metalpriceapi"
        cache.fetched_at = datetime.now(timezone.utc)
        cache.last_error = None
        cache.last_error_at = None
    else:
        cache.last_error = err
        cache.last_error_at = datetime.now(timezone.utc)
    db.session.add(cache)
    db.session.commit()
    return cache


def serialize_prices(cache: CommodityPriceCache) -> dict:
    items = []
    for entry in SYMBOLS:
        sym = entry["symbol"]
        price = (cache.rates or {}).get(sym)
        prev_price = (cache.prev_rates or {}).get(sym) if cache.prev_rates else None
        change_pct = None
        if price is not None and prev_price:
            try:
                change_pct = (price - prev_price) / prev_price * 100.0
            except ZeroDivisionError:
                change_pct = None
        items.append(
            {
                "symbol": sym,
                "label": entry["label"],
                "unit": entry["unit"],
                "price": price,
                "change_pct": change_pct,
                "available": price is not None,
            }
        )
    return {
        "items": items,
        "date": cache.date,
        "base": cache.base or "USD",
        "provider": cache.provider or "metalpriceapi",
        "fetched_at": cache.fetched_at.isoformat() if cache.fetched_at else None,
        "prev_date": cache.prev_date,
        "missing_symbols": cache.missing_symbols or [],
        "error": cache.last_error,
        "error_at": cache.last_error_at.isoformat() if cache.last_error_at else None,
        "configured": bool(_get_api_key()),
        "excluded": EXCLUDED,
    }
