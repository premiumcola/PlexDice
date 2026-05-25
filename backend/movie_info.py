"""Keyless movie info: factual highlights from the cached Plex metadata plus a
German-Wikipedia synopsis crawled per movie. No API key required."""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_UA = "PlexQuizDice/1.0 (self-hosted; +https://github.com/premiumcola/PlexDice)"
_WIKI = "https://de.wikipedia.org/api/rest_v1/page/summary/"
_FILM_HINTS = ("film", "spielfilm", "regie", "kinofilm", "regisseur", "serie")


def _names(people: Any, limit: int) -> List[str]:
    return [p.get("name") for p in (people or []) if p.get("name")][:limit]


def _runtime(mins: Any) -> Optional[str]:
    if not mins:
        return None
    hours, rest = divmod(int(mins), 60)
    return f"{hours} Std {rest} Min" if hours else f"{rest} Min"


def build_facts(movie: Dict[str, Any]) -> List[Dict[str, str]]:
    """Real, keyless facts from cached Plex metadata. Empty fields are skipped."""
    facts: List[Dict[str, str]] = []

    def add(emoji: str, category: str, text: Optional[str]) -> None:
        if text:
            facts.append({"emoji": emoji, "category": category, "text": text})

    directors = _names(movie.get("directors"), 2)
    add("🎬", "Regie", " & ".join(directors) if directors else None)
    cast = _names(movie.get("actors"), 3)
    add("🎭", "Besetzung", ", ".join(cast) if cast else None)
    writers = _names(movie.get("writers"), 2)
    add("✍️", "Drehbuch", " & ".join(writers) if writers else None)
    add("🏢", "Studio", movie.get("studio"))
    countries = movie.get("countries") or []
    add("🌍", "Land", ", ".join(countries[:2]) if countries else None)
    collections = movie.get("collections") or []
    add("🎞️", "Reihe", f"Teil der Reihe „{collections[0]}“" if collections else None)
    if movie.get("tagline"):
        add("💬", "Tagline", f"„{movie['tagline']}“")
    if movie.get("rating") is not None:
        add("⭐", "Bewertung", f"{movie['rating']:.1f}/10".replace(".", ","))
    if movie.get("year"):
        add("📅", "Jahr", f"Erschienen {movie['year']}")
    add("⏱️", "Laufzeit", _runtime(movie.get("duration_min")))
    if movie.get("fsk") is not None:
        add("🔞", "FSK", f"Freigegeben ab {movie['fsk']}")
    genres = movie.get("genres") or []
    add("🏷️", "Genre", ", ".join(genres[:3]) if genres else None)
    return facts


def _fetch_wiki(title: str) -> Optional[Dict[str, Any]]:
    url = _WIKI + urllib.parse.quote(title.replace(" ", "_"), safe="")
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            return json.load(resp)
    except Exception as exc:  # noqa: BLE001 — missing page / network blip → no synopsis
        logger.debug("Wikipedia fetch failed for %r: %s", title, exc)
        return None


def wiki_summary(
    title: Optional[str], year: Any = None, original_title: Optional[str] = None
) -> Optional[Dict[str, Optional[str]]]:
    """Best German-Wikipedia summary for the film, disambiguating book/film pages."""
    candidates: List[str] = []
    for base in (title, original_title):
        if base and base not in candidates:
            candidates += [base, f"{base} (Film)"]
    best = None
    best_score = -1
    for cand in candidates[:4]:
        data = _fetch_wiki(cand)
        if not data or data.get("type") != "standard" or not data.get("extract"):
            continue
        extract = data["extract"]
        lowered = extract.lower()
        score = 0
        if any(hint in lowered for hint in _FILM_HINTS):
            score += 2
        if year and str(year) in extract:
            score += 1
        if "(film" in cand.lower():
            score += 1
        if score > best_score:
            best_score = score
            best = {
                "extract": extract,
                "url": (data.get("content_urls", {}).get("desktop", {}) or {}).get("page"),
            }
        if best_score >= 3:  # confident film match — stop early
            break
    return best if best_score >= 2 else None


def gather(movie: Dict[str, Any]) -> Dict[str, Any]:
    """Facts + a synopsis (Wikipedia first, Plex summary as fallback)."""
    facts = build_facts(movie)
    wiki = wiki_summary(movie.get("title"), movie.get("year"), movie.get("originalTitle"))
    if wiki:
        return {"facts": facts, "plot": wiki["extract"], "wiki_url": wiki.get("url"), "source": "wikipedia"}
    if movie.get("summary"):
        return {"facts": facts, "plot": movie["summary"], "wiki_url": None, "source": "plex"}
    return {"facts": facts, "plot": "", "wiki_url": None, "source": "none"}
