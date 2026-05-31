"""Persistent settings storage backed by a JSON file in the data dir."""
from __future__ import annotations

import copy
import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from atomic_io import atomic_write_json

logger = logging.getLogger(__name__)


def _default_settings() -> Dict[str, Any]:
    return {
        "plex": {
            "url": "",
            "plex_server_url": "",
            "token": "",
            "ssl": True,
            "libraries": [],
            "client_id": "",
            "user": None,
        },
        "ai": {"enabled": True},
        "ui": {"last_filters": {}, "start_tab": "last", "reduce_motion": False},
        "quiz": {
            "default_difficulty": "medium",
            "default_size": 50,
            "countdown_seconds": 15,
            "sound_enabled": True,
            "enabled_modes": [],  # empty = all modes enabled
            "show_correct_on_wrong": True,
            "autoreveal_delay_ms": 1200,
            "connect_share": 0.2,  # minority share of "Verbinden" connect rounds per run (0 = off)
        },
    }


def _deep_merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge ``patch`` into ``base`` (mutates and returns base)."""
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


class SettingsStore:
    """Loads/saves settings.json, transparently reloading if changed on disk.

    Reloading on disk-mtime change keeps multiple gunicorn workers consistent
    without an external store.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._data: Dict[str, Any] = _default_settings()
        self._mtime: float = 0.0
        self._last_write_utc: Optional[str] = None
        self._ensure_file()
        self._reload()

    def _ensure_file(self) -> None:
        if not os.path.exists(self._path):
            if atomic_write_json(self._path, _default_settings(), indent=2):
                logger.info("Created default settings at %s", self._path)

    def _reload(self) -> None:
        try:
            mtime = os.path.getmtime(self._path)
        except OSError:
            return
        if mtime == self._mtime:
            return
        try:
            with open(self._path, "r", encoding="utf-8") as fh:
                loaded = json.load(fh)
            self._data = _deep_merge(_default_settings(), loaded)
            self._mtime = mtime
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Could not read settings, keeping current: %s", exc)

    def all(self) -> Dict[str, Any]:
        with self._lock:
            self._reload()
            return copy.deepcopy(self._data)

    def get(self, section: str) -> Dict[str, Any]:
        return self.all().get(section, {})

    def save(self) -> None:
        if atomic_write_json(self._path, self._data, indent=2):
            self._mtime = os.path.getmtime(self._path)
            self._last_write_utc = datetime.now(timezone.utc).isoformat()

    def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        """Deep-merge a partial settings dict and persist it."""
        with self._lock:
            self._reload()
            patch = copy.deepcopy(patch)
            plex_patch = patch.get("plex")
            if isinstance(plex_patch, dict):
                plex_patch.pop("tokenSet", None)
                # An empty/absent token never overwrites the stored one
                if not plex_patch.get("token"):
                    plex_patch.pop("token", None)
            _deep_merge(self._data, patch)
            self.save()
            return copy.deepcopy(self._data)

    def set_plex(self, **fields: Any) -> Dict[str, Any]:
        """Set plex fields directly (no token-drop guard) — used by the auth flow."""
        with self._lock:
            self._reload()
            self._data.setdefault("plex", {}).update(fields)
            self.save()
            return copy.deepcopy(self._data)

    def ensure_client_id(self) -> str:
        """Return a stable X-Plex-Client-Identifier, generating one on first use."""
        client_id = self.get("plex").get("client_id")
        if not client_id:
            client_id = str(uuid.uuid4())
            self.set_plex(client_id=client_id)
            logger.info("Generated Plex client identifier")
        return client_id

    def redacted(self) -> Dict[str, Any]:
        """Settings with the token stripped, plus a ``tokenSet`` flag for the UI."""
        data = self.all()
        plex = data.setdefault("plex", {})
        plex["tokenSet"] = bool(plex.get("token"))
        plex["token"] = ""
        return data

    def last_write_utc(self) -> Optional[str]:
        """UTC ISO timestamp of the last successful settings write this process made."""
        with self._lock:
            return self._last_write_utc
