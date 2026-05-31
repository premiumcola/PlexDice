"""Shared, server-side leaderboard + reusable player-name roster in /data.

Both files live under the bind-mounted DATA_DIR, so every user of the instance reads/writes the SAME
leaderboard and name roster. Writes are append/merge only (atomic). Never touches settings.json,
library_cache.json or ai_cache.json.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List

from atomic_io import atomic_write_json

logger = logging.getLogger(__name__)


class Leaderboard:
    def __init__(self, board_path: str, roster_path: str) -> None:
        self._board_path = board_path
        self._roster_path = roster_path
        self._lock = threading.Lock()

    @staticmethod
    def _read(path: str, default: Any) -> Any:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            return default

    # ---- shared leaderboard ----

    def submit(self, name: str, score: int, correct: int, wrong: int, size: int = 0) -> Dict[str, Any]:
        """Append one shared leaderboard entry (player + score + correct/wrong + timestamp)."""
        entry = {
            "name": (name or "").strip() or "Anonym",
            "score": int(score or 0),
            "correct": int(correct or 0),
            "wrong": int(wrong or 0),
            "size": int(size or 0),
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            board = self._read(self._board_path, [])
            board.append(entry)
            atomic_write_json(self._board_path, board, ensure_ascii=False)
        self.add_player(entry["name"])  # the entered name joins the shared roster (separate lock)
        return entry

    def top(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Top entries: highest score first, ties broken by most recent."""
        board = self._read(self._board_path, [])
        board.sort(key=lambda e: (e.get("score", 0), e.get("ts", "")), reverse=True)
        return board[: max(1, limit)]

    # ---- shared reusable player-name roster ----

    def players(self) -> List[str]:
        """All saved player names (shared roster), most-recent last."""
        return self._read(self._roster_path, [])

    def add_player(self, name: str) -> List[str]:
        """Add a player name to the shared roster: trim + case-insensitive dedupe."""
        name = (name or "").strip()
        if not name:
            return self._read(self._roster_path, [])
        with self._lock:
            roster = self._read(self._roster_path, [])
            if not any(p.lower() == name.lower() for p in roster):
                roster.append(name)
                atomic_write_json(self._roster_path, roster, ensure_ascii=False)
            return roster
