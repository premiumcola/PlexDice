"""Difficulty-aware round generation over the mode registry.

A round samples one mode per slot from the difficulty's tier distribution, picks
a candidate movie that has the data the mode needs, and builds the question —
retrying a few movies, then falling back to an easier tier. No movie repeats
within a round; (mode, movie) signatures seen in recent rounds are avoided; the
final array is shuffled so even identical pools play in a different order.
"""
from __future__ import annotations

import random
from typing import Any, Dict, List, Optional, Set, Tuple

from quiz.library import QuizLibrary
from quiz.modes import MODES, available_modes

TIER_WEIGHTS: Dict[str, Dict[int, float]] = {
    "easy": {1: 1.0},
    "medium": {1: 0.30, 2: 0.70},
    "hard": {2: 0.20, 3: 0.80},
    "mixed": {1: 0.33, 2: 0.33, 3: 0.34},
}
_MAX_MOVIE_TRIES = 5


class QuizGenerator:
    def __init__(self, movies: List[Dict[str, Any]], status: Dict[str, Any]) -> None:
        self.lib = QuizLibrary(movies, status)

    def available_modes(self) -> List[str]:
        return available_modes(self.lib)

    def build_round(
        self,
        size: int = 50,
        difficulty: str = "medium",
        enabled_modes: Optional[List[str]] = None,
        avoid: Optional[Set[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        avoid = set(avoid or set())
        avail = set(self.available_modes())
        if enabled_modes:
            avail &= set(enabled_modes)

        weights = TIER_WEIGHTS.get(difficulty, TIER_WEIGHTS["mixed"])
        tier_modes = {t: [m for m in avail if MODES[m].tier == t] for t in weights}
        tier_modes = {t: ms for t, ms in tier_modes.items() if ms}
        if not tier_modes and avail:  # difficulty tiers empty → use whatever is available
            tier_modes = {min(MODES[m].tier for m in avail): list(avail)}
            weights = {next(iter(tier_modes)): 1.0}

        meta = {
            "difficulty": difficulty,
            "modes": sorted({m for ms in tier_modes.values() for m in ms}),
            "insufficient_cast": not self.lib.cast_enriched,
        }
        if not tier_modes:
            return [], meta

        tiers = list(tier_modes.keys())
        tier_w = [weights[t] for t in tiers]
        ordered = sorted(tier_modes.keys())
        used: Set[str] = set()
        sigs = set(avoid)
        questions: List[Dict[str, Any]] = []
        for _ in range(size):
            tier = random.choices(tiers, weights=tier_w, k=1)[0]
            question = self._build_for_tier(tier, tier_modes, ordered, used, sigs)
            if question:
                questions.append(question)
        random.shuffle(questions)
        return questions, meta

    def _build_for_tier(self, tier, tier_modes, ordered, used, sigs) -> Optional[Dict[str, Any]]:
        # Try the requested tier, then easier tiers, then harder ones.
        fallback = [tier] + [t for t in ordered if t < tier] + [t for t in ordered if t > tier]
        for t in fallback:
            modes = list(tier_modes.get(t, []))
            random.shuffle(modes)
            for mode_id in modes:
                question = self._build_one(mode_id, used, sigs)
                if question:
                    return question
        return None

    def _build_one(self, mode_id: str, used: Set[str], sigs: Set[str]) -> Optional[Dict[str, Any]]:
        mode = MODES[mode_id]
        pool = [m for m in mode.pool(self.lib) if m["key"] not in used]
        random.shuffle(pool)
        tries = 0
        for movie in pool:
            if tries >= _MAX_MOVIE_TRIES:
                break
            signature = f"{mode_id}:{movie['key']}"
            if signature in sigs:
                continue  # asked recently — skip without spending a try
            tries += 1
            question = mode.make(movie, self.lib)
            if question:
                used.add(movie["key"])
                sigs.add(signature)
                return question
        return None
