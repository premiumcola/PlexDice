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
        self._enrich_lock = threading.Lock()
        self._enriching = False
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
                "schema_version": 3,
                "cast_enriched": False,
                "cast_progress": {"done": 0, "total": len(movies)},
                "meta_enriched": False,
                "meta_progress": {"done": 0, "total": len(movies)},
                "actor_thumbs": {},
                "refreshed_at": datetime.now(timezone.utc).isoformat(),
            }
            self.save()
        return {"count": len(movies), "refreshed_at": self._data["refreshed_at"]}

    # ---- Background enrichment: cast + extended metadata in one pass ----

    _EMPTY_META = {
        "studio": None, "countries": [], "tagline": None,
        "directors": [], "writers": [], "collections": [],
    }

    def status(self) -> Dict[str, Any]:
        """Schema version + enrichment progress for the API/frontend."""
        with self._lock:
            self._reload()
            return {
                "schema_version": self._data.get("schema_version", 1),
                "cast_enriched": bool(self._data.get("cast_enriched", False)),
                "cast_progress": self._data.get("cast_progress", {"done": 0, "total": 0}),
                "meta_enriched": bool(self._data.get("meta_enriched", False)),
                "meta_progress": self._data.get("meta_progress", {"done": 0, "total": 0}),
            }

    def person_thumb_raw(self, key: str) -> Optional[str]:
        """Raw Plex thumb for an actor/crew key (used by the thumb proxy)."""
        with self._lock:
            self._reload()
            return (self._data.get("actor_thumbs") or {}).get(str(key))

    def start_enrichment(self, plex_client: PlexClient, settings: SettingsStore) -> bool:
        """Spawn the background enrichment thread, unless already running/complete."""
        with self._enrich_lock:
            if self._enriching:
                return False
            with self._lock:
                self._reload()
                if self._data.get("cast_enriched") and self._data.get("meta_enriched"):
                    return False
                if not self._data.get("movies"):
                    return False
            plex = settings.get("plex")
            if not (plex.get("url") and plex.get("token")):
                return False
            self._enriching = True
        thread = threading.Thread(
            target=self._run_enrichment, args=(plex_client, settings), daemon=True
        )
        thread.start()
        return True

    def _run_enrichment(self, plex_client: PlexClient, settings: SettingsStore) -> None:
        """Fetch cast + crew/studio/country/tagline/collections per movie, batched."""
        try:
            plex = settings.get("plex")
            server = plex_client.connect(plex.get("url"), plex.get("token"))
        except Exception as exc:  # noqa: BLE001 — Plex unreachable → leave un-enriched
            logger.warning("Enrichment could not connect: %s", exc)
            with self._enrich_lock:
                self._enriching = False
            return
        try:
            with self._lock:
                self._reload()
                self._data.setdefault("actor_thumbs", {})
                self._data["schema_version"] = 3
                movies = self._data.get("movies", [])
                total = len(movies)
                pending = [
                    m for m in movies if m.get("actors") is None or m.get("directors") is None
                ]
                cast_done = sum(1 for m in movies if m.get("actors") is not None)
                meta_done = sum(1 for m in movies if m.get("directors") is not None)
                self._data["cast_enriched"] = False
                self._data["meta_enriched"] = False
                self._data["cast_progress"] = {"done": cast_done, "total": total}
                self._data["meta_progress"] = {"done": meta_done, "total": total}
                self.save()
            logger.info("Enrichment: %d movies pending", len(pending))
            processed = 0
            for movie in pending:
                result = plex_client.fetch_enrichment(server, movie.get("key"))
                with self._lock:
                    if movie.get("actors") is None:
                        movie["actors"] = result["actors"] if result else []
                        cast_done += 1
                    if movie.get("directors") is None:
                        movie.update(result["meta"] if result else self._EMPTY_META)
                        meta_done += 1
                    if result and result["thumbs"]:
                        self._data.setdefault("actor_thumbs", {}).update(result["thumbs"])
                    self._data["cast_progress"] = {"done": cast_done, "total": total}
                    self._data["meta_progress"] = {"done": meta_done, "total": total}
                    processed += 1
                    if processed % 80 == 0:
                        self.save()
            with self._lock:
                self._data["cast_enriched"] = True
                self._data["meta_enriched"] = True
                self._data["cast_progress"] = {"done": total, "total": total}
                self._data["meta_progress"] = {"done": total, "total": total}
                self.save()
            logger.info("Enrichment complete (%d movies)", total)
        except Exception:  # noqa: BLE001
            logger.exception("Enrichment failed")
        finally:
            with self._enrich_lock:
                self._enriching = False
