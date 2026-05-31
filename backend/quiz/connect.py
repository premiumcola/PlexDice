"""Connect ("Verbinden") quiz rounds: match 5 left items to 5 right items (1:1).

Each round is built from ONE relation (film <-> quote / genre / year / FSK / actor); the "mixed"
relation uses a different relation for each of its 5 pairs. Reuses modes.py helpers — _opt (stable
item ids), _poster, _chip, _censor_plot, _REDACT_RE — and library.py pools, so there is no second
censor / poster / image-filter implementation. The 10 items are split into two SHUFFLED columns with
MIXED types (posters are never all on one side, so column heights balance) and the correct pairing is
never row-aligned.
"""
from __future__ import annotations

import logging
import random
from typing import Any, Callable, Dict, List, Optional, Tuple

from quiz.library import QuizLibrary
from quiz.modes import _REDACT_RE, _censor_plot, _chip, _opt, _poster

logger = logging.getLogger(__name__)

PAIRS_PER_ROUND = 5

# A film's matching token for each text relation (quote / genre / year / FSK).
_VALUE_FNS: Dict[str, Callable[[Dict[str, Any]], Optional[str]]] = {
    "film_zitat": lambda m: ((m.get("tagline") or "").strip() or None),
    "film_genre": lambda m: ((m.get("genres") or [None])[0]),
    "film_jahr": lambda m: (str(m["year"]) if m.get("year") else None),
    "film_fsk": lambda m: (f"FSK {m['fsk']}" if m.get("fsk") is not None else None),
}
SINGLE_RELATIONS: Tuple[str, ...] = ("film_zitat", "film_genre", "film_jahr", "film_fsk", "film_actor")


def _visible(token: str) -> bool:
    """True if a censored token still has readable (non-redacted) characters left."""
    return bool(_REDACT_RE.sub("", token).strip())


def _text_candidates(
    lib: QuizLibrary, value_fn: Callable[[Dict[str, Any]], Optional[str]]
) -> List[Tuple[Dict[str, Any], Any]]:
    """(movie, censored token) for every poster film that has the value. Reuses _censor_plot so a
    token never leaks its own film's title/aliases (e.g. the "2049" of "Blade Runner 2049")."""
    out: List[Tuple[Dict[str, Any], Any]] = []
    for m in lib.poster_movies:
        raw = value_fn(m)
        if not raw:
            continue
        token = _censor_plot(str(raw), m)[0].strip()
        if _visible(token):
            out.append((m, token))
    return out


def _actor_candidates(lib: QuizLibrary) -> List[Tuple[Dict[str, Any], Any]]:
    """(movie, lead actor WITH a portrait). Reuses the image filter so portraits are never empty."""
    out: List[Tuple[Dict[str, Any], Any]] = []
    for m in lib.poster_movies:
        actor = next((a for a in (m.get("actors") or []) if a.get("thumb_url")), None)
        if actor:
            out.append((m, actor))
    return out


def _candidates(relation: str, lib: QuizLibrary) -> List[Tuple[Dict[str, Any], Any]]:
    if relation == "film_actor":
        return _actor_candidates(lib)
    value_fn = _VALUE_FNS.get(relation)
    return _text_candidates(lib, value_fn) if value_fn else []


def _partner_key(relation: str, partner: Any) -> str:
    """Dedup key so the 5 right-hand values stay DISTINCT (unambiguous 1:1 matching)."""
    return partner.get("name") if relation == "film_actor" else str(partner)


def _pick_pairs(
    relation: str, lib: QuizLibrary, k: int, used_films: Optional[set] = None
) -> List[Tuple[Dict[str, Any], Any]]:
    """Up to k (movie, partner) pairs with distinct films AND distinct partner values."""
    cands = _candidates(relation, lib)
    random.shuffle(cands)
    seen_films = set(used_films or ())
    seen_values: set = set()
    out: List[Tuple[Dict[str, Any], Any]] = []
    for movie, partner in cands:
        if movie["key"] in seen_films or _partner_key(relation, partner) in seen_values:
            continue
        seen_films.add(movie["key"])
        seen_values.add(_partner_key(relation, partner))
        out.append((movie, partner))
        if len(out) == k:
            break
    return out


def _partner_item(relation: str, partner: Any) -> Dict[str, Any]:
    """Build the right-hand item: a square actor portrait, or a short text token."""
    if relation == "film_actor":
        return _opt("image", partner.get("thumb_url"), partner.get("name"), aspect="1/1")
    return _chip(partner)


def _derange(ids: List[str], forbidden: List[str]) -> List[str]:
    """Order `ids` so ids[i] != forbidden[i] for all i (no row is a correct pair)."""
    order = list(ids)
    for _ in range(200):
        random.shuffle(order)
        if all(order[i] != forbidden[i] for i in range(len(order))):
            return order
    for i in range(len(order)):  # deterministic fallback: swap any leftover fixed point out
        if order[i] == forbidden[i]:
            for j in range(len(order)):
                if i != j and order[j] != forbidden[i] and order[i] != forbidden[j]:
                    order[i], order[j] = order[j], order[i]
                    break
    return order


def _arrange_columns(pair_items: List[Tuple[Dict[str, Any], Dict[str, Any]]]) -> Dict[str, List[str]]:
    """Two columns of item ids: posters/partners MIXED across both (heights balance), the order
    shuffled and DERANGED so no row (left[i], right[i]) is a correct pair — the layout never gives
    the matching away."""
    n = len(pair_items)
    partner_of: Dict[str, str] = {}
    for film_item, partner_item in pair_items:
        partner_of[film_item["id"]] = partner_item["id"]
        partner_of[partner_item["id"]] = film_item["id"]
    film_left = set(random.sample(range(n), n // 2))  # ~half the posters left, the rest right
    left_ids: List[str] = []
    right_ids: List[str] = []
    for i, (film_item, partner_item) in enumerate(pair_items):
        first, second = (film_item, partner_item) if i in film_left else (partner_item, film_item)
        left_ids.append(first["id"])
        right_ids.append(second["id"])
    random.shuffle(left_ids)
    forbidden = [partner_of[lid] for lid in left_ids]  # right[i] must NOT be left[i]'s partner
    return {"left": left_ids, "right": _derange(right_ids, forbidden)}


def _assemble(relation: str, tagged_pairs: List[Tuple[Dict[str, Any], Any, str]]) -> Dict[str, Any]:
    """Turn (movie, partner, relation) triples into the connect-round payload."""
    pair_items: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    items: List[Dict[str, Any]] = []
    pairs: List[Dict[str, str]] = []
    for movie, partner, rel in tagged_pairs:
        film_item = _poster(movie)
        partner_item = _partner_item(rel, partner)
        pair_items.append((film_item, partner_item))
        items.append(film_item)
        items.append(partner_item)
        pairs.append({"left": film_item["id"], "right": partner_item["id"]})
    return {
        "mode": "connect",
        "relation": relation,
        "pairs": pairs,
        "items": items,
        "columns": _arrange_columns(pair_items),
    }


def build_connect_round(relation: str, lib: QuizLibrary) -> Optional[Dict[str, Any]]:
    """Build one connect round for `relation` (a SINGLE_RELATIONS kind). Returns None if the library
    lacks 5 valid, distinct pairs. ("mixed" is handled in F2.)"""
    if relation not in SINGLE_RELATIONS:
        return None
    picked = _pick_pairs(relation, lib, PAIRS_PER_ROUND)
    if len(picked) < PAIRS_PER_ROUND:
        return None
    return _assemble(relation, [(m, p, relation) for (m, p) in picked])
