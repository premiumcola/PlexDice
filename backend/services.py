"""Shared singletons wired from environment configuration."""
from __future__ import annotations

import logging
import os

import urllib3

from atomic_io import file_size
from library_cache import LibraryCache
from plex_client import PlexClient, _lan_link_base
from settings import SettingsStore

logger = logging.getLogger(__name__)

# Plex thumbnails are fetched over LAN, often with self-signed certs — skip verify, mute warnings.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DATA_DIR = os.environ.get("DATA_DIR", "/data")

settings_store = SettingsStore(os.path.join(DATA_DIR, "settings.json"))
library_cache = LibraryCache(os.path.join(DATA_DIR, "library_cache.json"))
plex_client = PlexClient()


def _log_persistence_diagnostics() -> None:
    """Log once at boot where DATA_DIR resolves and whether it will persist.

    A non-writable DATA_DIR is the usual cause of "settings gone after restart":
    the container ends up writing to its ephemeral layer instead of the mounted
    volume. Surfacing this loudly turns a silent data-loss bug into an obvious one.
    """
    abs_dir = os.path.abspath(DATA_DIR)
    exists = os.path.isdir(abs_dir)
    writable = exists and os.access(abs_dir, os.W_OK)
    settings_bytes = file_size(os.path.join(DATA_DIR, "settings.json"))
    cache_bytes = file_size(os.path.join(DATA_DIR, "library_cache.json"))
    logger.info(
        "Persistence: DATA_DIR=%s exists=%s writable=%s settings.json=%dB library_cache.json=%dB",
        abs_dir, exists, writable, settings_bytes, cache_bytes,
    )
    if not writable:
        logger.error(
            "CRITICAL: DATA_DIR=%s is not writable — settings WILL NOT persist across "
            "restarts. Check your docker-compose volume mount.",
            abs_dir,
        )


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


def _maybe_enrich() -> None:
    """On boot, if the cache predates cast/metadata (schema < 3) or was interrupted,
    kick off background enrichment so the quiz modes light up."""
    try:
        status = library_cache.status()
        if status.get("cast_enriched") and status.get("meta_enriched"):
            return
        if not library_cache.movies():
            return
        if not settings_store.get("plex").get("token"):
            return
        if library_cache.start_enrichment(plex_client, settings_store):
            logger.info("Started background library enrichment on boot")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Boot enrichment skipped: %s", exc)


def _heal_stale_deep_links() -> None:
    """Rewrite plex.direct URLs in the in-memory library cache to the clean LAN-IP base.
    The on-disk JSON is NOT modified — each boot heals the in-memory copy idempotently
    (movies() shares the dict references, so the mutation sticks)."""
    try:
        movies = library_cache.movies()
        if not movies:
            return
        plex = settings_store.get("plex")
        manual = (plex.get("plex_server_url") or "").strip() or None
        link_base = _lan_link_base(plex.get("url") or "", manual)
        if ".plex.direct" in link_base:
            return  # nothing better to offer
        healed = 0
        for m in movies:
            url = m.get("plex_url") or ""
            if ".plex.direct" not in url:
                continue
            # Split at ":32400" to keep the /web/index.html#!/... suffix.
            parts = url.split(":32400", 1)
            if len(parts) != 2:
                continue
            m["plex_url"] = f"{link_base}{parts[1]}"
            healed += 1
        if healed:
            logger.info("Healed %d stale plex.direct deep-links in memory", healed)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Deep-link heal skipped: %s", exc)


_log_persistence_diagnostics()
_seed_from_env()
settings_store.ensure_client_id()
_maybe_enrich()
_heal_stale_deep_links()
