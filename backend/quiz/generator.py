"""Round generation over the mode registry. Difficulty-aware sampling + shuffle
lands in the F8 task; this builds an even spread across available modes."""
from __future__ import annotations

import random
from typing import Any, Dict, List, Optional, Tuple

from quiz.library import QuizLibrary
from quiz.modes import MODES, available_modes


class QuizGenerator:
    def __init__(self, movies: List[Dict[str, Any]], status: Dict[str, Any]) -> None:
        self.lib = QuizLibrary(movies, status)

    def available_modes(self) -> List[str]:
        return available_modes(self.lib)

    def build_round(
        self, size: int = 50, modes: Optional[List[str]] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        avail = self.available_modes()
        wanted = [m for m in (modes or avail) if m in avail] or avail
        meta = {"insufficient_cast": not self.lib.cast_enriched, "modes": wanted}
        if not wanted:
            return [], meta
        counts = self._distribute(size, wanted)
        used: set = set()
        questions: List[Dict[str, Any]] = []
        for mode_id, n in counts.items():
            self._fill(mode_id, n, used, questions)
        random.shuffle(questions)
        return questions, meta

    @staticmethod
    def _distribute(size: int, modes: List[str]) -> Dict[str, int]:
        k = len(modes)
        base, rem = divmod(size, k)
        return {m: base + (1 if i < rem else 0) for i, m in enumerate(modes)}

    def _fill(self, mode_id: str, n: int, used: set, questions: List[Dict[str, Any]]) -> None:
        mode = MODES[mode_id]
        pool = [m for m in mode.pool(self.lib) if m["key"] not in used]
        random.shuffle(pool)
        made = 0
        for movie in pool:
            if made >= n:
                break
            question = mode.make(movie, self.lib)
            if question:
                used.add(movie["key"])
                questions.append(question)
                made += 1
