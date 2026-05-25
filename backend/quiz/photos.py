"""Round group-photo storage: resize, EXIF-strip, serve, on-the-fly variants."""
from __future__ import annotations

import logging
import os
from typing import Iterable, Optional

from PIL import Image, ImageOps

from services import DATA_DIR

logger = logging.getLogger(__name__)

_DIR = os.path.join(DATA_DIR, "quiz_photos")
_MAX_SIDE = 1200


def _ensure_dir() -> None:
    os.makedirs(_DIR, exist_ok=True)


def _base_path(photo_id: str) -> str:
    return os.path.join(_DIR, f"{photo_id}.jpg")


def _variant_path(photo_id: str, width: int) -> str:
    return os.path.join(_DIR, f"{photo_id}_w{width}.jpg")


def save(file_storage) -> str:
    """Persist an uploaded image as a normalized JPEG; return its photo_id."""
    _ensure_dir()
    photo_id = os.urandom(16).hex()
    image = Image.open(file_storage.stream)
    image = ImageOps.exif_transpose(image)  # bake orientation, then drop EXIF
    image = image.convert("RGB")
    image.thumbnail((_MAX_SIDE, _MAX_SIDE))
    image.save(_base_path(photo_id), "JPEG", quality=82)
    return photo_id


def get_path(photo_id: str, width: Optional[int] = None) -> Optional[str]:
    """Path to the full JPEG, or a cached/just-built smaller variant."""
    base = _base_path(photo_id)
    if not os.path.exists(base):
        return None
    if not width:
        return base
    variant = _variant_path(photo_id, width)
    if os.path.exists(variant):
        return variant
    try:
        image = Image.open(base).convert("RGB")
        image.thumbnail((width, width))
        image.save(variant, "JPEG", quality=80)
        return variant
    except Exception:  # noqa: BLE001 — fall back to the full image
        return base


def delete(photo_id: Optional[str]) -> None:
    """Remove a photo and all its variants."""
    if not photo_id:
        return
    try:
        for name in os.listdir(_DIR):
            if name == f"{photo_id}.jpg" or name.startswith(f"{photo_id}_w"):
                try:
                    os.remove(os.path.join(_DIR, name))
                except OSError:
                    pass
    except OSError:
        pass


def cleanup_orphans(valid_ids: Iterable[str]) -> None:
    """Delete any stored photo whose id isn't referenced by a saved round."""
    valid = set(valid_ids)
    try:
        names = os.listdir(_DIR)
    except OSError:
        return
    for name in names:
        if not name.endswith(".jpg"):
            continue
        photo_id = name[:-4].split("_w")[0]
        if photo_id not in valid:
            try:
                os.remove(os.path.join(_DIR, name))
            except OSError:
                pass
