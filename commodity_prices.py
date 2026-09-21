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

import re
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


# Constat réel (relevé de production du 21/09/2026, plan gratuit) :
# MetalpriceAPI a renvoyé "XCU query requires a paid plan" dès que le cuivre
# figure dans la requête — la documentation publique ne détaillait pas cette
# restriction. Contrairement à ce qu'on aurait pu espérer, l'API rejette
# ALORS LA REQUÊTE ENTIÈRE dès qu'un seul symbole demandé n'est pas couvert
# par le plan souscrit (les métaux précieux classiques — or, argent, platine,
# palladium — restent, eux, explicitement documentés comme inclus dans le
# plan gratuit). Pour ne jamais perdre l'intégralité de la bande à cause d'un
# seul symbole non couvert, la requête est donc scindée en deux groupes fixes
# (2 appels/jour au lieu d'1, ce qui reste largement sous la limite de 100
# requêtes/mois du plan gratuit) : les métaux précieux d'une part, les
# métaux de base et l'énergie d'autre part. Si le second groupe échoue pour
# la même raison, on le signale explicitement (voir PLAN_RESTRICTED) plutôt
# que d'escamoter la bande entière — cohérent avec le principe « ne rien
# cacher » du site.
FREE_TIER_GROUP = ["XAU"]
EXTENDED_GROUP = ["XCU", "XCO", "ZNC", "XSN", "XLI", "NI", "WTI", "BRENT"]

PAID_PLAN_ERROR_RE = re.compile(r"([A-Z]{2,10})\s+query requires a paid plan", re.I)


def _call_metalpriceapi(key: str, symbols: list[str]):
    """Un seul appel HTTP. Renvoie (raw_rates_dict, None) ou (None, message
    d'erreur explicite) — ne calcule ni n'invente jamais de valeur."""
    try:
        resp = requests.get(
            METALPRICEAPI_URL,
            params={"api_key": key, "base": "USD", "currencies": ",".join(symbols)},
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
        return None, info
    return payload.get("rates") or {}, None


def _extract_prices(raw_rates: dict, symbols: list[str]) -> tuple[dict, list[str]]:
    prices: dict[str, float] = {}
    missing: list[str] = []
    for sym in symbols:
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
    return prices, missing


def _fetch_from_provider() -> tuple[dict | None, str | None]:
    """Interroge MetalpriceAPI en deux groupes (voir note ci-dessus). Ne
    renvoie jamais de valeur reconstituée : soit les cours réellement
    renvoyés par le fournisseur, soit None avec un message d'erreur
    explicite. Un échec limité à un groupe (ex: plan gratuit ne couvrant pas
    les métaux de base/l'énergie) n'empêche pas d'afficher l'autre groupe."""
    key = _get_api_key()
    if not key:
        return None, (
            "Aucune clé API MetalpriceAPI n'est configurée "
            "(mode administrateur > Vue d'ensemble > Bande des cours)."
        )

    prices: dict[str, float] = {}
    missing: list[str] = []
    plan_restricted: list[str] = []
    group_errors: list[str] = []

    for group in (FREE_TIER_GROUP, EXTENDED_GROUP):
        raw_rates, err = _call_metalpriceapi(key, group)
        if raw_rates is not None:
            p, m = _extract_prices(raw_rates, group)
            prices.update(p)
            missing.extend(m)
            continue
        m = PAID_PLAN_ERROR_RE.search(err or "")
        if m:
            # Le message nomme un symbole précis (« XCU query requires a
            # paid plan »), mais l'API a rejeté tout le groupe dès ce
            # premier symbole non couvert plutôt que de traiter les autres
            # un par un ; on ne sait donc pas, sans plan payant pour
            # vérifier, si les AUTRES symboles du groupe le seraient aussi.
            # On le signale honnêtement pour le groupe entier plutôt que de
            # prétendre le savoir symbole par symbole.
            plan_restricted.extend(group)
        else:
            group_errors.append(err or "erreur inconnue")

    if not prices:
        if plan_restricted and not group_errors:
            return None, (
                "MetalpriceAPI a indiqué que les symboles suivants "
                "nécessitent un plan payant sur votre compte : "
                + ", ".join(plan_restricted) + "."
            )
        return None, "MetalpriceAPI a renvoyé une erreur : " + "; ".join(group_errors or ["réponse vide"])

    missing.extend(plan_restricted)
    result = {"prices": prices, "missing": missing, "plan_restricted": plan_restricted}
    if group_errors:
        # Un groupe a échoué pour une raison AUTRE que la restriction de
        # plan : on affiche quand même ce qui a pu être obtenu, mais on ne
        # tait pas l'incident (repris dans last_error côté cache/serialize).
        result["partial_error"] = "; ".join(group_errors)
    return result, None


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
        cache.plan_restricted = result.get("plan_restricted") or []
        cache.provider = "metalpriceapi"
        cache.fetched_at = datetime.now(timezone.utc)
        # Un succès partiel (ex: métaux précieux obtenus mais groupe
        # métaux de base/énergie en échec pour une autre raison qu'une
        # restriction de plan déjà répertoriée ci-dessus) reste visible en
        # mode administrateur plutôt que d'être tu.
        cache.last_error = result.get("partial_error")
        cache.last_error_at = datetime.now(timezone.utc) if result.get("partial_error") else None
    else:
        cache.last_error = err
        cache.last_error_at = datetime.now(timezone.utc)
    db.session.add(cache)
    db.session.commit()
    return cache


def serialize_prices(cache: CommodityPriceCache) -> dict:
    plan_restricted = set(cache.plan_restricted or [])
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
                "plan_restricted": sym in plan_restricted,
            }
        )
    plan_restricted_labels = [e["label"] for e in SYMBOLS if e["symbol"] in plan_restricted]
    return {
        "items": items,
        "date": cache.date,
        "base": cache.base or "USD",
        "provider": cache.provider or "metalpriceapi",
        "fetched_at": cache.fetched_at.isoformat() if cache.fetched_at else None,
        "prev_date": cache.prev_date,
        "missing_symbols": cache.missing_symbols or [],
        "plan_restricted_labels": plan_restricted_labels,
        "error": cache.last_error,
        "error_at": cache.last_error_at.isoformat() if cache.last_error_at else None,
        "configured": bool(_get_api_key()),
        "excluded": EXCLUDED,
    }
