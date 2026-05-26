"""Persistence health diagnostics — lets the Settings page warn on data-loss risk."""
from __future__ import annotations

import os

from flask import Blueprint

from atomic_io import file_size
from services import DATA_DIR, settings_store

bp = Blueprint("health", __name__, url_prefix="/api/health")


@bp.get("/persistence")
def persistence():
    """Report whether /data is writable and how much state currently lives on disk."""
    abs_dir = os.path.abspath(DATA_DIR)
    writable = os.path.isdir(abs_dir) and os.access(abs_dir, os.W_OK)
    return {
        "data_dir": abs_dir,
        "writable": writable,
        "settings_bytes": file_size(os.path.join(DATA_DIR, "settings.json")),
        "library_cache_bytes": file_size(os.path.join(DATA_DIR, "library_cache.json")),
        "last_settings_write_utc": settings_store.last_write_utc(),
    }
