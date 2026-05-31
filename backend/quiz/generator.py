"""Difficulty-aware round generation over the mode registry.

A round samples one mode per slot from the difficulty's tier distribution, picks
a candidate movie that has the data the mode needs, and builds the question —
retrying a few movies, then falling back to an easier tier. No movie repeats
within a round; (mode, movie) signatures seen in recent rounds are avoided; the
final array is shuffled so even identical pools play in a different order.
"""
from __future__ import annotations

import logging
import random
from collections import Counter
from typing import Any, Dict, List, Optional, Set, Tuple

from quiz.connect import CONNECT_RELATIONS, make_connect_question
from quiz.library import QuizLibrary
from quiz.modes import MODES, available_modes

logger = logging.getLogger(__name__)

TIER_WEIGHTS: Dict[str, Dict[int, float]] = {
    "easy": {1: 1.0},
    "medium": {1: 0.30, 2: 0.70},
    "hard": {2: 0.20, 3: 0.80},
    "mixed": {1: 1 / 3, 2: 1 / 3, 3: 1 / 3},
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
        connect_share: float = 0.2,
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
        # Mixed aims for an even tier split per round; weighted draws stay noisy at
        # small sizes, so plan its slots deterministically. Other difficulties keep
        # their per-slot weighted draw.
        if difficulty == "mixed":
            tier_plan = self._even_tier_plan(ordered, size)
        else:
            tier_plan = random.choices(tiers, weights=tier_w, k=size)
        random.shuffle(tier_plan)
        used: Set[str] = set()
        sigs = set(avoid)
        questions: List[Dict[str, Any]] = []
        for tier in tier_plan:
            question = self._build_for_tier(tier, tier_modes, ordered, used, sigs)
            if question:
                questions.append(question)
        random.shuffle(questions)
        questions = self._inject_connect(questions, connect_share)
        tier_counts = Counter(qq.get("tier") for qq in questions)
        logger.info(
            "Quiz round built: difficulty=%s size=%d tiers=%s",
            difficulty, len(questions), dict(sorted(tier_counts.items())),
        )
        return questions, meta

    def _inject_connect(self, questions: List[Dict[str, Any]], share: float) -> List[Dict[str, Any]]:
        """Replace a spaced, non-adjacent MINORITY of slots with connect rounds (relation varied,
        incl. 'mixed'). Runs on the FINAL order so no two connect rounds are ever adjacent. A slot
        that can't build any connect round keeps its classic question (the Task-F fallback), so a
        run always stays full."""
        n = len(questions)
        target = min(round(n * share), n // 2) if share > 0 else 0
        if n < 3 or target <= 0:
            return questions
        even = list(range(0, n, 2))  # even indices differ by >= 2 → never adjacent
        positions = sorted(random.sample(even, min(target, len(even))))
        relations = list(CONNECT_RELATIONS.keys())
        random.shuffle(relations)
        ri = 0
        for pos in positions:
            for _ in range(len(relations)):
                built = make_connect_question(relations[ri % len(relations)], self.lib)
                ri += 1
                if built:
                    questions[pos] = built
                    break
        return questions

    @staticmethod
    def _even_tier_plan(tiers: List[int], size: int) -> List[int]:
        """Slot tiers as evenly as possible: floor(size/k) each, the remainder
        distributed round-robin starting from the second tier."""
        tiers = sorted(tiers)
        k = len(tiers) or 1
        counts = {t: size // k for t in tiers}
        for i in range(size % k):
            counts[tiers[(1 + i) % k]] += 1
        plan: List[int] = []
        for t in tiers:
            plan.extend([t] * counts[t])
        return plan

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
