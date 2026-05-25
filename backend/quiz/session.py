"""In-memory active quiz sessions (ephemeral — lost on restart, acceptable for v1)."""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def score_for(correct: bool, time_ms: Optional[int]) -> int:
    """100 / 80 / 60 points for a correct answer within 5 / 10 / 15s; else 0."""
    if not correct:
        return 0
    ms = 15000 if time_ms is None else time_ms
    if ms <= 5000:
        return 100
    if ms <= 10000:
        return 80
    if ms <= 15000:
        return 60
    return 0


class Session:
    def __init__(
        self, round_id: str, questions: List[Dict[str, Any]], name: Optional[str], modes: List[str]
    ) -> None:
        self.round_id = round_id
        self.questions = questions
        self.name = name
        self.modes = modes
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.answers: Dict[str, Dict[str, Any]] = {}
        self.score = 0
        self._by_id = {q["id"]: q for q in questions}

    def record(
        self, question_id: str, chosen_option_id: Optional[str], time_ms: Optional[int]
    ) -> Optional[Dict[str, Any]]:
        question = self._by_id.get(question_id)
        if not question:
            return None
        correct = chosen_option_id is not None and chosen_option_id == question["correct_option_id"]
        points = score_for(correct, time_ms)
        previous = self.answers.get(question_id)
        if previous:
            self.score -= previous["points"]
        self.answers[question_id] = {
            "chosen_option_id": chosen_option_id,
            "time_ms": time_ms,
            "correct": correct,
            "points": points,
        }
        self.score += points
        return {
            "correct": correct,
            "correct_option_id": question["correct_option_id"],
            "current_score": self.score,
        }


class SessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, Session] = {}
        self._lock = threading.Lock()

    def create(self, questions: List[Dict[str, Any]], name: Optional[str], modes: List[str]) -> Session:
        round_id = uuid.uuid4().hex
        session = Session(round_id, questions, name, modes)
        with self._lock:
            self._sessions[round_id] = session
        return session

    def get(self, round_id: str) -> Optional[Session]:
        with self._lock:
            return self._sessions.get(round_id)

    def drop(self, round_id: str) -> Optional[Session]:
        with self._lock:
            return self._sessions.pop(round_id, None)
