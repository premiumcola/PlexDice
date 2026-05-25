"""Builds quiz question pools from the cached Plex library.

Each question is a uniform shape consumed verbatim by the frontend:
    {id, mode, stem:{kind,content}, options:[{id,kind,content,label}],
     correct_option_id, movie_key, movie_title, actor_name, difficulty}
"""
from __future__ import annotations

import random
import uuid
from typing import Any, Dict, List, Optional, Tuple

MODES = ["cover_to_title", "actor_to_movie", "movie_to_actor", "plot_to_movie"]
_DIFFICULTY = {
    "cover_to_title": 1,
    "plot_to_movie": 2,
    "movie_to_actor": 2,
    "actor_to_movie": 3,
}


def _decade(year: Any) -> Optional[int]:
    try:
        return (int(year) // 10) * 10
    except (TypeError, ValueError):
        return None


def _opt(kind: str, content: Optional[str], label: Optional[str]) -> Dict[str, Any]:
    return {"id": uuid.uuid4().hex, "kind": kind, "content": content or "", "label": label or ""}


class QuizGenerator:
    """Indexes a movie list once, then emits rounds of mixed-mode questions."""

    def __init__(self, movies: List[Dict[str, Any]], cast_enriched: bool = False) -> None:
        self.cast_enriched = cast_enriched
        self.movies = [m for m in movies if m.get("title")]
        self.poster_movies = [m for m in self.movies if m.get("_thumb")]
        self.plot_movies = [m for m in self.movies if (m.get("summary") or "").strip()]
        self.actor_movies: Dict[str, List[Dict[str, Any]]] = {}
        self.actor_info: Dict[str, Dict[str, Any]] = {}
        for movie in self.movies:
            for actor in movie.get("actors") or []:
                name = actor.get("name")
                if not name:
                    continue
                self.actor_movies.setdefault(name, []).append(movie)
                known = self.actor_info.get(name)
                if known is None or (actor.get("thumb_url") and not known.get("thumb_url")):
                    self.actor_info[name] = actor
        self.has_cast = bool(self.actor_movies)

    # ---- public ----

    def available_modes(self) -> List[str]:
        modes: List[str] = []
        if len(self.poster_movies) >= 4:
            modes.append("cover_to_title")
        if len(self.plot_movies) >= 4:
            modes.append("plot_to_movie")
        if self.cast_enriched and self.has_cast and len(self.poster_movies) >= 4:
            if any(self.actor_movies.values()):
                modes.append("actor_to_movie")
            if len(self.actor_info) >= 4:
                modes.append("movie_to_actor")
        return modes

    def build_round(
        self, size: int = 50, modes: Optional[List[str]] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        avail = self.available_modes()
        wanted = [m for m in (modes or MODES) if m in avail] or avail
        insufficient_cast = not (self.cast_enriched and self.has_cast)
        if not wanted:
            return [], {"insufficient_cast": insufficient_cast, "modes": []}

        counts = self._distribute(size, wanted)
        questions: List[Dict[str, Any]] = []
        used: set = set()
        for mode, n in counts.items():
            made = 0
            attempts = 0
            cap = max(n * 25, 50)
            while made < n and attempts < cap:
                attempts += 1
                q = self._make(mode, used)
                if q:
                    questions.append(q)
                    made += 1
        random.shuffle(questions)
        return questions, {"insufficient_cast": insufficient_cast, "modes": wanted}

    # ---- helpers ----

    @staticmethod
    def _distribute(size: int, modes: List[str]) -> Dict[str, int]:
        k = len(modes)
        base, rem = divmod(size, k)
        return {m: base + (1 if i < rem else 0) for i, m in enumerate(modes)}

    def _make(self, mode: str, used: set) -> Optional[Dict[str, Any]]:
        if mode == "cover_to_title":
            return self._cover_to_title(used)
        if mode == "plot_to_movie":
            return self._plot_to_movie(used)
        if mode == "movie_to_actor":
            return self._movie_to_actor(used)
        if mode == "actor_to_movie":
            return self._actor_to_movie(used)
        return None

    def _question(
        self,
        mode: str,
        stem: Dict[str, Any],
        options: List[Dict[str, Any]],
        correct_id: str,
        movie: Dict[str, Any],
        actor_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {
            "id": uuid.uuid4().hex,
            "mode": mode,
            "stem": stem,
            "options": options,
            "correct_option_id": correct_id,
            "movie_key": str(movie.get("key")),
            "movie_title": movie.get("title"),
            "actor_name": actor_name,
            "difficulty": _DIFFICULTY[mode],
        }

    def _actor_opt(self, actor: Dict[str, Any]) -> Dict[str, Any]:
        if actor.get("thumb_url"):
            return _opt("image", actor["thumb_url"], actor.get("name"))
        return _opt("text", actor.get("name"), actor.get("role"))

    def _decade_title_distractors(self, movie: Dict[str, Any], k: int) -> List[Dict[str, Any]]:
        dec = _decade(movie.get("year"))
        title = movie["title"]
        pool = [m for m in self.movies if m["title"] != title]
        if dec is not None:
            near = [
                m for m in pool
                if _decade(m.get("year")) is not None and abs(_decade(m.get("year")) - dec) <= 10
            ]
            if len(near) >= k:
                pool = near
        return self._unique_titles(pool, {title}, k)

    def _genre_title_distractors(self, movie: Dict[str, Any], k: int) -> List[Dict[str, Any]]:
        genres = set(movie.get("genres") or [])
        title = movie["title"]
        dec = _decade(movie.get("year"))
        pool = [m for m in self.movies if m["title"] != title and genres & set(m.get("genres") or [])]
        if len(pool) < k:
            pool = [m for m in self.movies if m["title"] != title]
        random.shuffle(pool)
        pool.sort(
            key=lambda m: 0
            if dec is not None
            and _decade(m.get("year")) is not None
            and abs(_decade(m.get("year")) - dec) <= 10
            else 1
        )
        return self._unique_titles(pool, {title}, k, preshuffled=True)

    @staticmethod
    def _unique_titles(
        pool: List[Dict[str, Any]], seen: set, k: int, preshuffled: bool = False
    ) -> List[Dict[str, Any]]:
        if not preshuffled:
            pool = list(pool)
            random.shuffle(pool)
        out: List[Dict[str, Any]] = []
        seen = set(seen)
        for m in pool:
            if m["title"] in seen:
                continue
            seen.add(m["title"])
            out.append(m)
            if len(out) == k:
                break
        return out

    def _cover_to_title(self, used: set) -> Optional[Dict[str, Any]]:
        pool = [m for m in self.poster_movies if m["key"] not in used]
        if not pool:
            return None
        movie = random.choice(pool)
        distractors = self._decade_title_distractors(movie, 3)
        if len(distractors) < 3:
            return None
        used.add(movie["key"])
        correct = _opt("text", movie["title"], str(movie.get("year") or ""))
        options = [correct] + [_opt("text", d["title"], str(d.get("year") or "")) for d in distractors]
        random.shuffle(options)
        stem = {"kind": "image", "content": movie.get("thumb_url")}
        return self._question("cover_to_title", stem, options, correct["id"], movie)

    def _plot_to_movie(self, used: set) -> Optional[Dict[str, Any]]:
        pool = [m for m in self.plot_movies if m["key"] not in used]
        if not pool:
            return None
        movie = random.choice(pool)
        distractors = self._genre_title_distractors(movie, 3)
        if len(distractors) < 3:
            return None
        used.add(movie["key"])
        correct = _opt("text", movie["title"], str(movie.get("year") or ""))
        options = [correct] + [_opt("text", d["title"], str(d.get("year") or "")) for d in distractors]
        random.shuffle(options)
        stem = {"kind": "text", "content": (movie.get("summary") or "").strip()}
        return self._question("plot_to_movie", stem, options, correct["id"], movie)

    def _movie_to_actor(self, used: set) -> Optional[Dict[str, Any]]:
        pool = [m for m in self.movies if m.get("actors") and m["key"] not in used]
        random.shuffle(pool)
        for movie in pool:
            lead = movie["actors"][0]
            name = lead.get("name")
            if not name:
                continue
            distractors = self._other_actors(movie, 3)
            if len(distractors) < 3:
                continue
            used.add(movie["key"])
            correct = self._actor_opt(lead)
            options = [correct] + [self._actor_opt(a) for a in distractors]
            random.shuffle(options)
            stem = {"kind": "image", "content": movie.get("thumb_url")}
            return self._question("movie_to_actor", stem, options, correct["id"], movie, actor_name=name)
        return None

    def _other_actors(self, movie: Dict[str, Any], k: int) -> List[Dict[str, Any]]:
        genres = set(movie.get("genres") or [])
        in_movie = {a.get("name") for a in (movie.get("actors") or [])}
        same_genre: List[str] = []
        for name in self.actor_info:
            if name in in_movie:
                continue
            if genres and not any(
                genres & set(mm.get("genres") or []) for mm in self.actor_movies.get(name, [])
            ):
                continue
            same_genre.append(name)
        random.shuffle(same_genre)
        if len(same_genre) < k:
            extra = [n for n in self.actor_info if n not in in_movie and n not in same_genre]
            random.shuffle(extra)
            same_genre += extra
        return [self.actor_info[n] for n in same_genre[:k]]

    def _actor_to_movie(self, used: set) -> Optional[Dict[str, Any]]:
        names = [n for n, ms in self.actor_movies.items() if ms]
        random.shuffle(names)
        for name in names:
            candidates = [m for m in self.actor_movies[name] if m["key"] not in used and m.get("_thumb")]
            if not candidates:
                continue
            movie = random.choice(candidates)
            distractors = self._actor_movie_distractors(name, 3)
            if len(distractors) < 3:
                continue
            used.add(movie["key"])
            info = self.actor_info.get(name, {"name": name})
            correct = _opt("image", movie.get("thumb_url"), movie["title"])
            options = [correct] + [_opt("image", d.get("thumb_url"), d["title"]) for d in distractors]
            random.shuffle(options)
            if info.get("thumb_url"):
                stem = {"kind": "image", "content": info["thumb_url"]}
            else:
                stem = {"kind": "text", "content": name}
            return self._question("actor_to_movie", stem, options, correct["id"], movie, actor_name=name)
        return None

    def _actor_movie_distractors(self, name: str, k: int) -> List[Dict[str, Any]]:
        actor_genres: set = set()
        for mm in self.actor_movies.get(name, []):
            actor_genres |= set(mm.get("genres") or [])
        actor_keys = {m["key"] for m in self.actor_movies.get(name, [])}
        pool = [
            m for m in self.poster_movies
            if m["key"] not in actor_keys and (not actor_genres or actor_genres & set(m.get("genres") or []))
        ]
        if len(pool) < k:
            pool = [m for m in self.poster_movies if m["key"] not in actor_keys]
        return self._unique_titles(pool, set(), k)
