"""Indexed view over the cached movie library + distractor strategies.

Modes (quiz/modes.py) query this for candidate pools and plausible wrong
options. Distractor strategy names mirror the X2 task registry.
"""
from __future__ import annotations

import logging
import random
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

# Distractor strategy names (mode → strategy mapping lives in quiz/modes.py).
STRATEGIES = (
    "genre_and_decade",
    "genre_adjacent",
    "decade_adjacent",
    "collection_other",
    "same_decade_different_genre",
)


def decade_of(year: Any) -> Optional[int]:
    try:
        return (int(year) // 10) * 10
    except (TypeError, ValueError):
        return None


class QuizLibrary:
    def __init__(self, movies: List[Dict[str, Any]], status: Dict[str, Any]) -> None:
        self.cast_enriched = bool(status.get("cast_enriched"))
        self.meta_enriched = bool(status.get("meta_enriched"))
        self.movies = [m for m in movies if m.get("title")]
        self.poster_movies = [m for m in self.movies if m.get("_thumb")]

        self.actor_movies: Dict[str, List[Dict[str, Any]]] = {}
        self.actor_info: Dict[str, Dict[str, Any]] = {}
        self.director_movies: Dict[str, List[Dict[str, Any]]] = {}
        self.director_info: Dict[str, Dict[str, Any]] = {}
        self.writer_movies: Dict[str, List[Dict[str, Any]]] = {}
        self.writer_info: Dict[str, Dict[str, Any]] = {}
        self.collection_movies: Dict[str, List[Dict[str, Any]]] = {}
        self.genres: set = set()
        self.studios: set = set()
        self.countries: set = set()

        for m in self.movies:
            for g in m.get("genres") or []:
                self.genres.add(g)
            if m.get("studio"):
                self.studios.add(m["studio"])
            for c in m.get("countries") or []:
                self.countries.add(c)
            for col in m.get("collections") or []:
                self.collection_movies.setdefault(col, []).append(m)
            self._index_people(m, m.get("actors"), self.actor_movies, self.actor_info)
            self._index_people(m, m.get("directors"), self.director_movies, self.director_info)
            self._index_people(m, m.get("writers"), self.writer_movies, self.writer_info)

        self._counts = {
            "poster": len(self.poster_movies),
            "summary": sum(1 for m in self.movies if (m.get("summary") or "").strip()),
            "tagline": sum(1 for m in self.movies if (m.get("tagline") or "").strip()),
            "fsk": sum(1 for m in self.movies if m.get("fsk") is not None),
            "year": sum(1 for m in self.movies if m.get("year")),
            "runtime": sum(1 for m in self.movies if m.get("duration_min")),
        }

    @staticmethod
    def _index_people(movie, people, movies_idx, info_idx) -> None:
        for person in people or []:
            name = person.get("name")
            if not name:
                continue
            movies_idx.setdefault(name, []).append(movie)
            known = info_idx.get(name)
            if known is None or (person.get("thumb_url") and not known.get("thumb_url")):
                info_idx[name] = person

    def has(self, token: str) -> bool:
        """Is there enough data in the library to build questions of this kind?"""
        if token == "cast":
            return self.cast_enriched and len(self.actor_info) >= 8
        if token == "directors":
            return self.meta_enriched and len(self.director_info) >= 8
        if token == "writers":
            return self.meta_enriched and len(self.writer_info) >= 8
        if token == "studio":
            return len(self.studios) >= 4
        if token == "countries":
            return len(self.countries) >= 4
        if token == "collections":
            return len(self.collection_movies) >= 4
        return self._counts.get(token, 0) >= 8

    # ---- small accessors ----
    @staticmethod
    def primary_genre(movie: Dict[str, Any]) -> Optional[str]:
        genres = movie.get("genres") or []
        return genres[0] if genres else None

    @staticmethod
    def _near_decade(movie: Dict[str, Any], dec: Optional[int]) -> bool:
        md = decade_of(movie.get("year"))
        return dec is not None and md is not None and abs(md - dec) <= 10

    # ---- movie distractors ----
    def movie_distractors(
        self, target: Dict[str, Any], strategy: str, k: int, exclude: Sequence[str] = ()
    ) -> List[Dict[str, Any]]:
        """Up to k plausible wrong movies (unique titles), walking the strategy's
        filter chain from most specific down to "any movie" so it never fails."""
        blocked = set(exclude) | {target.get("key")}
        genres = set(target.get("genres") or [])
        cols = set(target.get("collections") or [])
        dec = decade_of(target.get("year"))
        pool = self.poster_movies

        def shares_genre(m):
            return bool(genres & set(m.get("genres") or []))

        chains = {
            "genre_and_decade": [
                lambda m: shares_genre(m) and self._near_decade(m, dec),
                shares_genre,
                lambda m: self._near_decade(m, dec),
            ],
            "genre_adjacent": [shares_genre, lambda m: self._near_decade(m, dec)],
            "decade_adjacent": [lambda m: self._near_decade(m, dec)],
            "collection_other": [
                lambda m: bool(cols & set(m.get("collections") or [])),
                shares_genre,
            ],
            "same_decade_different_genre": [
                lambda m: self._near_decade(m, dec) and not shares_genre(m)
            ],
        }
        chain = list(chains.get(strategy, [shares_genre]))
        chain.append(lambda m: self._near_decade(m, dec) and not shares_genre(m))  # SAME_DECADE_DIFFERENT_GENRE
        chain.append(lambda m: True)  # any movie

        out: List[Dict[str, Any]] = []
        seen_titles = {target.get("title")}
        for predicate in chain:
            candidates = [m for m in pool if m.get("key") not in blocked and predicate(m)]
            random.shuffle(candidates)
            for m in candidates:
                if m["title"] in seen_titles:
                    continue
                seen_titles.add(m["title"])
                blocked.add(m.get("key"))
                out.append(m)
                if len(out) == k:
                    return out
        if len(out) < k:
            logger.warning(
                "distractors: only %d/%d for '%s' via %s", len(out), k, target.get("title"), strategy
            )
        return out

    def studio_peers(self, target: Dict[str, Any], k: int) -> List[str]:
        """STUDIO_PEER: other studios that produced films in the target's genre."""
        pg = self.primary_genre(target)
        own = target.get("studio")
        peers = {
            m["studio"]
            for m in self.movies
            if m.get("studio") and m["studio"] != own and (pg is None or pg in (m.get("genres") or []))
        }
        result = list(peers)
        random.shuffle(result)
        if len(result) < k:
            extra = [s for s in self.studios if s != own and s not in peers]
            random.shuffle(extra)
            result += extra
        return result[:k]

    # ---- person distractors ----
    def person_distractors(self, kind: str, target_movie, exclude_names, k: int) -> List[Dict[str, Any]]:
        """Other actors/directors from films sharing the target's primary genre."""
        info = self.actor_info if kind == "actor" else self.director_info
        movies_idx = self.actor_movies if kind == "actor" else self.director_movies
        pg = self.primary_genre(target_movie)
        blocked = set(exclude_names)

        def peer(name):
            if pg is None:
                return True
            return any(pg in (mm.get("genres") or []) for mm in movies_idx.get(name, []))

        names = [n for n in info if n not in blocked and peer(n)]
        random.shuffle(names)
        if len(names) < k:
            extra = [n for n in info if n not in blocked and n not in names]
            random.shuffle(extra)
            names += extra
        return [info[n] for n in names[:k]]

    # ---- value distractors (chips) ----
    def value_distractors(self, correct, present, k: int) -> List[Any]:
        others = [v for v in present if v != correct]
        random.shuffle(others)
        return others[:k]

    @staticmethod
    def numeric_distractors(correct: int, spread: int, step: int, k: int) -> List[int]:
        """Plausible near values for year/runtime chips (within ±spread)."""
        candidates = list(range(correct - spread, correct + spread + 1, step))
        candidates = [c for c in candidates if c != correct and c > 0]
        random.shuffle(candidates)
        return candidates[:k]
