"""Persisted quiz history + per-movie learning stats in /data."""
from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class History:
    def __init__(self, history_path: str, stats_path: str, recent_path: str) -> None:
        self._history_path = history_path
        self._stats_path = stats_path
        self._recent_path = recent_path
        self._lock = threading.Lock()

    def recent_signatures(self) -> set:
        """(mode:movie_key) signatures from recent rounds, to avoid repeats."""
        return set(self._read(self._recent_path, []))

    def push_signatures(self, signatures: List[str]) -> None:
        with self._lock:
            recent = self._read(self._recent_path, [])
            recent.extend(signatures)
            self._write(self._recent_path, recent[-100:])

    @staticmethod
    def _read(path: str, default: Any) -> Any:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            return default

    @staticmethod
    def _write(path: str, data: Any) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
        os.replace(tmp, path)

    def add_round(self, record: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            rounds = self._read(self._history_path, [])
            rounds.append(record)
            self._write(self._history_path, rounds)

            stats = self._read(self._stats_path, {})
            for q in record.get("questions", []):
                key = str(q.get("movie_key"))
                entry = stats.setdefault(key, {"attempts": []})
                entry["attempts"].append(
                    {
                        "round_id": record["id"],
                        "mode": q.get("mode"),
                        "correct": bool(q.get("correct")),
                        "ts": record.get("finished_at"),
                    }
                )
            self._write(self._stats_path, stats)
        return record

    def list_rounds(self) -> List[Dict[str, Any]]:
        rounds = self._read(self._history_path, [])
        return [
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "finished_at": r.get("finished_at"),
                "created_at": r.get("created_at"),
                "score": r.get("score", 0),
                "size": r.get("size", 0),
                "difficulty": r.get("difficulty"),
                "photo_id": r.get("photo_id"),
                "player_names": r.get("player_names", []),
                "modes": r.get("modes", []),
            }
            for r in rounds
        ]

    def get_round(self, round_id: str) -> Optional[Dict[str, Any]]:
        for r in self._read(self._history_path, []):
            if r.get("id") == round_id:
                return r
        return None

    def all_photo_ids(self) -> List[str]:
        return [r.get("photo_id") for r in self._read(self._history_path, []) if r.get("photo_id")]

    def delete_round(self, round_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            rounds = self._read(self._history_path, [])
            removed = next((r for r in rounds if r.get("id") == round_id), None)
            if not removed:
                return None
            self._write(self._history_path, [r for r in rounds if r.get("id") != round_id])

            stats = self._read(self._stats_path, {})
            for key in list(stats.keys()):
                attempts = [a for a in stats[key].get("attempts", []) if a.get("round_id") != round_id]
                if attempts:
                    stats[key]["attempts"] = attempts
                else:
                    del stats[key]
            self._write(self._stats_path, stats)
        return removed

    def movie_stats(self, movie_key: str) -> Dict[str, Any]:
        stats = self._read(self._stats_path, {})
        return stats.get(str(movie_key), {"attempts": []})

    def top_movies(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Most-asked movies with correct-rate, for the History insight tab."""
        stats = self._read(self._stats_path, {})
        rows = []
        for key, entry in stats.items():
            attempts = entry.get("attempts", [])
            if not attempts:
                continue
            correct = sum(1 for a in attempts if a.get("correct"))
            rows.append(
                {
                    "movie_key": key,
                    "count": len(attempts),
                    "correct": correct,
                    "rate": round(correct / len(attempts), 2),
                    "attempts": attempts,
                }
            )
        rows.sort(key=lambda r: r["count"], reverse=True)
        return rows[:limit]
