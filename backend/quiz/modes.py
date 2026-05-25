"""Registry of quiz question modes across three difficulty tiers.

Each ModeDef builds one Question from a subject movie + the QuizLibrary context,
returning None if that movie lacks the data the mode needs (the generator then
tries another candidate). Distractor strategy names mirror the X2 task.
"""
from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from quiz.library import QuizLibrary, decade_of

FSK_VALUES = [0, 6, 12, 16, 18]


def _opt(kind: str, content: Optional[str], label: Optional[str]) -> Dict[str, Any]:
    return {"id": uuid.uuid4().hex, "kind": kind, "content": content or "", "label": label or ""}


def _poster(m):
    return _opt("image", m.get("thumb_url"), m.get("title"))


def _title(m):
    return _opt("text", m.get("title"), str(m.get("year") or ""))


def _chip(text):
    return _opt("text", str(text), "")


def _person_opt(p):
    if p.get("thumb_url"):
        return _opt("image", p["thumb_url"], p.get("name"))
    return _opt("text", p.get("name"), p.get("role") or "")


def _poster_stem(m):
    return {"kind": "image", "content": m.get("thumb_url")}


def _text_stem(t):
    return {"kind": "text", "content": t}


def _person_stem(p):
    if p.get("thumb_url"):
        return {"kind": "image", "content": p["thumb_url"]}
    return {"kind": "text", "content": p.get("name")}


def _single(correct, distractors):
    options = [correct] + list(distractors)
    random.shuffle(options)
    return {"options": options, "correct_option_id": correct["id"]}


def _runtime_label(v: int) -> str:
    h, mm = divmod(int(v), 60)
    return f"{h}h {mm:02d}m" if h else f"{mm}m"


# ---------- TIER 1 ----------
def b_cover_to_title(m, lib):
    d = lib.movie_distractors(m, "genre_and_decade", 3)
    if len(d) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_title(m), [_title(x) for x in d])}


def b_cover_to_decade(m, lib):
    dec = decade_of(m.get("year"))
    if dec is None:
        return None
    present = sorted({decade_of(x.get("year")) for x in lib.movies if decade_of(x.get("year")) is not None})
    others = lib.value_distractors(dec, present, 3)
    if len(others) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_chip(f"{dec}er"), [_chip(f"{o}er") for o in others])}


def b_cover_to_genre(m, lib):
    pg = lib.primary_genre(m)
    if not pg:
        return None
    others = lib.value_distractors(pg, list(lib.genres), 3)
    if len(others) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_chip(pg), [_chip(o) for o in others])}


def b_cover_to_studio(m, lib):
    if not m.get("studio"):
        return None
    others = lib.studio_peers(m, 3)  # STUDIO_PEER + genre fallback
    if len(others) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_chip(m["studio"]), [_chip(o) for o in others])}


def b_title_year_to_cover(m, lib):
    d = lib.movie_distractors(m, "genre_and_decade", 3)
    if len(d) < 3:
        return None
    stem = _text_stem(f"{m['title']} ({m.get('year') or '?'})")
    return {"stem": stem, **_single(_poster(m), [_poster(x) for x in d])}


# ---------- TIER 2 ----------
def b_actor_to_movie(m, lib):
    actors = m.get("actors") or []
    if not actors:
        return None
    actor = actors[0]
    exclude = [x["key"] for x in lib.actor_movies.get(actor["name"], [])]
    d = lib.movie_distractors(m, "genre_adjacent", 3, exclude=exclude)
    if len(d) < 3:
        return None
    return {"stem": _person_stem(actor), "actor_name": actor.get("name"),
            **_single(_poster(m), [_poster(x) for x in d])}


def b_movie_to_actor(m, lib):
    actors = m.get("actors") or []
    if not actors:
        return None
    correct_actor = actors[0]
    in_movie = {a.get("name") for a in actors}
    d = lib.person_distractors("actor", m, in_movie, 3)
    if len(d) < 3:
        return None
    return {"stem": _poster_stem(m), "actor_name": correct_actor.get("name"),
            **_single(_person_opt(correct_actor), [_person_opt(p) for p in d])}


def b_plot_to_movie(m, lib):
    plot = (m.get("summary") or "").strip()
    if not plot:
        return None
    d = lib.movie_distractors(m, "genre_and_decade", 3)
    if len(d) < 3:
        return None
    return {"stem": _text_stem(plot), **_single(_poster(m), [_poster(x) for x in d])}


def b_tagline_to_movie(m, lib):
    tagline = (m.get("tagline") or "").strip()
    if not tagline:
        return None
    d = lib.movie_distractors(m, "genre_adjacent", 3)
    if len(d) < 3:
        return None
    return {"stem": _text_stem(tagline), **_single(_poster(m), [_poster(x) for x in d])}


def b_director_to_movie(m, lib):
    dirs = m.get("directors") or []
    if not dirs:
        return None
    director = dirs[0]
    exclude = [x["key"] for x in lib.director_movies.get(director["name"], [])]
    d = lib.movie_distractors(m, "genre_adjacent", 3, exclude=exclude)
    if len(d) < 3:
        return None
    return {"stem": _person_stem(director), **_single(_poster(m), [_poster(x) for x in d])}


def b_movie_to_fsk(m, lib):
    if m.get("fsk") is None:
        return None
    correct = m["fsk"]
    pool = [v for v in FSK_VALUES if v != correct]
    if correct >= 12:  # CLOSE_VALUE: 16 vs 12 vs 18, avoid the trivial 0
        pool = [v for v in pool if v != 0] or pool
    others = sorted(pool, key=lambda v: abs(v - correct))[:3]
    if len(others) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_chip(f"FSK {correct}"), [_chip(f"FSK {o}") for o in others])}


def b_movie_to_country(m, lib):
    countries = m.get("countries") or []
    if not countries:
        return None
    correct = countries[0]
    others = lib.value_distractors(correct, list(lib.countries), 3)
    if len(others) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_chip(correct), [_chip(o) for o in others])}


# ---------- TIER 3 ----------
def b_movie_to_director(m, lib):
    dirs = m.get("directors") or []
    if not dirs:
        return None
    correct_dir = dirs[0]
    in_movie = {d.get("name") for d in dirs}
    d = lib.person_distractors("director", m, in_movie, 3)
    if len(d) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_person_opt(correct_dir), [_person_opt(p) for p in d])}


def b_movie_to_year_exact(m, lib):
    if not m.get("year"):
        return None
    year = int(m["year"])
    others = lib.numeric_distractors(year, 2, 1, 3)
    if len(others) < 3:
        return None
    return {"stem": _poster_stem(m), **_single(_chip(year), [_chip(o) for o in others])}


def b_movie_to_runtime(m, lib):
    if not m.get("duration_min"):
        return None
    rt = int(m["duration_min"])
    others = lib.numeric_distractors(rt, 15, 5, 3)
    if len(others) < 3:
        return None
    return {"stem": _poster_stem(m),
            **_single(_chip(_runtime_label(rt)), [_chip(_runtime_label(o)) for o in others])}


def b_plot_redacted_to_movie(m, lib):
    plot = (m.get("summary") or "").strip()
    if not plot:
        return None
    terms = set()
    for word in re.findall(r"\w+", m.get("title") or ""):
        if len(word) >= 3:
            terms.add(word.lower())
    for person in (m.get("actors") or []) + (m.get("directors") or []):
        for part in re.findall(r"\w+", person.get("name") or ""):
            if len(part) >= 3:
                terms.add(part.lower())
    tokens = re.findall(r"\w+|\W+", plot)
    redacted = 0
    words = 0
    out = []
    for tok in tokens:
        if re.fullmatch(r"\w+", tok):
            words += 1
            if tok.lower() in terms:
                out.append("▮▮▮")
                redacted += 1
                continue
        out.append(tok)
    if words == 0 or redacted == 0 or redacted / words > 0.30:
        return None
    d = lib.movie_distractors(m, "genre_and_decade", 3)
    if len(d) < 3:
        return None
    return {"stem": _text_stem("".join(out)), **_single(_poster(m), [_poster(x) for x in d])}


def b_actor_filmography_multi(m, lib):
    actors = m.get("actors") or []
    if not actors:
        return None
    actor = actors[0]
    seen = set()
    films = []
    for x in lib.actor_movies.get(actor["name"], []):
        if x.get("_thumb") and x["title"] not in seen:
            seen.add(x["title"])
            films.append(x)
    if len(films) < 2:
        return None
    n_correct = min(3, len(films))
    correct_movies = random.sample(films, n_correct)
    exclude = [x["key"] for x in lib.actor_movies.get(actor["name"], [])]
    distract = lib.movie_distractors(m, "genre_adjacent", 6 - n_correct, exclude=exclude)
    if len(distract) < 6 - n_correct:
        return None
    correct_opts = [_poster(x) for x in correct_movies]
    options = correct_opts + [_poster(x) for x in distract]
    random.shuffle(options)
    return {
        "stem": _person_stem(actor),
        "options": options,
        "correct_option_id": None,
        "correct_option_ids": [o["id"] for o in correct_opts],
        "multi_select": True,
        "min_correct": 2,
        "max_correct": 3,
        "actor_name": actor.get("name"),
    }


def b_writer_to_movie(m, lib):
    writers = m.get("writers") or []
    if not writers:
        return None
    writer = writers[0]
    exclude = [x["key"] for x in lib.writer_movies.get(writer["name"], [])]
    d = lib.movie_distractors(m, "genre_adjacent", 3, exclude=exclude)
    if len(d) < 3:
        return None
    return {"stem": _text_stem(f"Drehbuch: {writer['name']}"), **_single(_poster(m), [_poster(x) for x in d])}


def b_two_actors_to_shared(m, lib):
    actors = m.get("actors") or []
    if len(actors) < 2:
        return None
    a1, a2 = actors[0], actors[1]
    films1 = {x["key"] for x in lib.actor_movies.get(a1["name"], [])}
    films2 = {x["key"] for x in lib.actor_movies.get(a2["name"], [])}
    both = films1 & films2
    one_only = [x for x in lib.poster_movies if x["key"] not in both and (x["key"] in films1) != (x["key"] in films2)]
    random.shuffle(one_only)
    seen = {m["title"]}
    distract = []
    for x in one_only:
        if x["title"] in seen:
            continue
        seen.add(x["title"])
        distract.append(x)
        if len(distract) == 3:
            break
    if len(distract) < 3:
        distract += lib.movie_distractors(m, "genre_adjacent", 3 - len(distract), exclude=[d["key"] for d in distract])
    if len(distract) < 3:
        return None
    stem = _text_stem(f"{a1['name']} & {a2['name']}")
    return {"stem": stem, "actor_name": a1.get("name"), **_single(_poster(m), [_poster(x) for x in distract])}


def b_collection_member(m, lib):
    cols = m.get("collections") or []
    if not cols:
        return None
    col = cols[0]
    members = [x["key"] for x in lib.collection_movies.get(col, [])]
    d = lib.movie_distractors(m, "genre_adjacent", 3, exclude=members)
    if len(d) < 3:
        return None
    return {"stem": _text_stem(f"Reihe: {col}"), **_single(_poster(m), [_poster(x) for x in d])}


@dataclass
class ModeDef:
    id: str
    tier: int
    label: str
    description: str
    requires: tuple
    builder: Callable
    pool: Callable

    def make(self, movie: Dict[str, Any], lib: QuizLibrary) -> Optional[Dict[str, Any]]:
        core = self.builder(movie, lib)
        if not core:
            return None
        question = {
            "id": uuid.uuid4().hex,
            "mode": self.id,
            "tier": self.tier,
            "difficulty": self.tier,
            "movie_key": str(movie.get("key")),
            "movie_title": movie.get("title"),
            "movie_year": movie.get("year"),
            "actor_name": core.get("actor_name"),
            "multi_select": core.get("multi_select", False),
        }
        question.update(core)
        return question


def _pool(*tokens):
    """Subject-movie pool: poster movies that have all the given fields."""
    def picker(lib: QuizLibrary):
        out = lib.poster_movies
        for tok in tokens:
            if tok == "summary":
                out = [m for m in out if (m.get("summary") or "").strip()]
            elif tok == "tagline":
                out = [m for m in out if (m.get("tagline") or "").strip()]
            else:
                out = [m for m in out if m.get(tok)]
        return out
    return picker


_DEFS = [
    ModeDef("cover_to_title", 1, "Cover → Titel", "Poster zum richtigen Titel zuordnen", ("poster",), b_cover_to_title, _pool()),
    ModeDef("cover_to_decade", 1, "Cover → Jahrzehnt", "Aus welchem Jahrzehnt ist dieses Poster?", ("poster", "year"), b_cover_to_decade, _pool("year")),
    ModeDef("cover_to_genre", 1, "Cover → Genre", "Welches Genre hat dieser Film?", ("poster",), b_cover_to_genre, _pool()),
    ModeDef("cover_to_studio", 1, "Cover → Studio", "Welches Studio steckt dahinter?", ("poster", "studio"), b_cover_to_studio, _pool("studio")),
    ModeDef("title_year_to_cover", 1, "Titel → Cover", "Welches Poster gehört zum Titel?", ("poster",), b_title_year_to_cover, _pool()),
    ModeDef("actor_to_movie", 2, "Schauspieler → Film", "In welchem Film spielt diese Person?", ("poster", "cast"), b_actor_to_movie, _pool("actors")),
    ModeDef("movie_to_actor", 2, "Film → Schauspieler", "Wer spielt in diesem Film mit?", ("poster", "cast"), b_movie_to_actor, _pool("actors")),
    ModeDef("plot_to_movie", 2, "Plot → Film", "Zu welchem Film gehört dieser Plot?", ("poster", "summary"), b_plot_to_movie, _pool("summary")),
    ModeDef("tagline_to_movie", 2, "Tagline → Film", "Zu welchem Film gehört dieser Slogan?", ("poster", "tagline"), b_tagline_to_movie, _pool("tagline")),
    ModeDef("director_to_movie", 2, "Regisseur → Film", "Welchen Film hat diese Person inszeniert?", ("poster", "directors"), b_director_to_movie, _pool("directors")),
    ModeDef("movie_to_fsk", 2, "Film → FSK", "Welche Altersfreigabe hat der Film?", ("poster", "fsk"), b_movie_to_fsk, _pool("fsk")),
    ModeDef("movie_to_country", 2, "Film → Land", "Aus welchem Land kommt der Film?", ("poster", "countries"), b_movie_to_country, _pool("countries")),
    ModeDef("movie_to_director", 3, "Film → Regisseur", "Wer führte hier Regie?", ("poster", "directors"), b_movie_to_director, _pool("directors")),
    ModeDef("movie_to_year_exact", 3, "Film → Jahr", "In welchem Jahr genau erschien der Film?", ("poster", "year"), b_movie_to_year_exact, _pool("year")),
    ModeDef("movie_to_runtime", 3, "Film → Laufzeit", "Wie lang ist der Film?", ("poster", "runtime"), b_movie_to_runtime, _pool("duration_min")),
    ModeDef("plot_redacted_to_movie", 3, "Plot (zensiert) → Film", "Erkennst du den Film am zensierten Plot?", ("poster", "summary"), b_plot_redacted_to_movie, _pool("summary")),
    ModeDef("actor_filmography_multi", 3, "Filmografie", "Welche Filme gehören zu dieser Person? (Mehrfachauswahl)", ("poster", "cast"), b_actor_filmography_multi, _pool("actors")),
    ModeDef("writer_to_movie", 3, "Drehbuch → Film", "Welchen Film schrieb diese Person?", ("poster", "writers"), b_writer_to_movie, _pool("writers")),
    ModeDef("two_actors_to_shared", 3, "Zwei Stars → Film", "In welchem Film spielten beide mit?", ("poster", "cast"), b_two_actors_to_shared, _pool("actors")),
    ModeDef("collection_member", 3, "Filmreihe", "Welcher Film gehört zu dieser Reihe?", ("poster", "collections"), b_collection_member, _pool("collections")),
]

MODES: Dict[str, ModeDef] = {d.id: d for d in _DEFS}


def available_modes(lib: QuizLibrary) -> List[str]:
    return [mid for mid, md in MODES.items() if all(lib.has(tok) for tok in md.requires)]
