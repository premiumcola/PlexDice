"""Cached snapshot of the Plex movie library on disk."""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from plex_client import PlexClient
from settings import SettingsStore

logger = logging.getLogger(__name__)


class LibraryCache:
    """Reads/writes /data/library_cache.json, reloading on disk-mtime change."""

    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._data: Dict[str, Any] = {"movies": [], "refreshed_at": None}
        self._mtime: float = 0.0
        self._reload()

    def _reload(self) -> None:
        try:
            mtime = os.path.getmtime(self._path)
        except OSError:
            return
        if mtime == self._mtime:
            return
        try:
            with open(self._path, "r", encoding="utf-8") as fh:
                self._data = json.load(fh)
            self._mtime = mtime
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Could not read library cache: %s", exc)

    def save(self) -> None:
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as fh:
            json.dump(self._data, fh, ensure_ascii=False)
        self._mtime = os.path.getmtime(self._path)

    def movies(self) -> List[Dict[str, Any]]:
        with self._lock:
            self._reload()
            return list(self._data.get("movies", []))

    def refreshed_at(self) -> Optional[str]:
        with self._lock:
            self._reload()
            return self._data.get("refreshed_at")

    def count(self) -> int:
        return len(self.movies())

    def find(self, rating_key: str) -> Optional[Dict[str, Any]]:
        for movie in self.movies():
            if str(movie.get("key")) == str(rating_key):
                return movie
        return None

    def refresh(self, plex_client: PlexClient, settings: SettingsStore) -> Dict[str, Any]:
        """Fetch all movies from Plex and overwrite the cache."""
        plex = settings.get("plex")
        url, token = plex.get("url"), plex.get("token")
        if not url or not token:
            raise ValueError("Plex is not configured")
        server = plex_client.connect(url, token)
        section_ids = plex.get("libraries") or None
        movies = plex_client.fetch_all_movies(server, section_ids, base_url=url)
        machine_id = getattr(server, "machineIdentifier", None)
        with self._lock:
            self._data = {
                "movies": movies,
                "server": {"machine_id": machine_id},
                "refreshed_at": datetime.now(timezone.utc).isoformat(),
            }
            self.save()
        return {"count": len(movies), "refreshed_at": self._data["refreshed_at"]}
