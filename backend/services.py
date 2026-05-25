"""Shared singletons wired from environment configuration."""
from __future__ import annotations

import logging
import os

import urllib3

from library_cache import LibraryCache
from plex_client import PlexClient
from settings import SettingsStore

logger = logging.getLogger(__name__)

# Plex thumbnails are fetched over LAN, often with self-signed certs — skip verify, mute warnings.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DATA_DIR = os.environ.get("DATA_DIR", "/data")

settings_store = SettingsStore(os.path.join(DATA_DIR, "settings.json"))
library_cache = LibraryCache(os.path.join(DATA_DIR, "library_cache.json"))
plex_client = PlexClient()
AI_CACHE_PATH = os.path.join(DATA_DIR, "ai_cache.json")


def _seed_from_env() -> None:
    """On first start, seed Plex config from PLEX_URL/PLEX_TOKEN if settings are empty."""
    if settings_store.get("plex").get("token"):
        return
    env_url = os.environ.get("PLEX_URL")
    env_token = os.environ.get("PLEX_TOKEN")
    plex_patch: dict = {}
    if env_url:
        plex_patch["url"] = env_url
    if env_token:
        plex_patch["token"] = env_token
    if plex_patch:
        settings_store.update({"plex": plex_patch})
        logger.info("Seeded Plex settings from environment")


_seed_from_env()
settings_store.ensure_client_id()
