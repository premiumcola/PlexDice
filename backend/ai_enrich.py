"""Optional Anthropic-powered plot enrichment for a picked movie."""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"
_DISABLED: Dict[str, Any] = {"plot": "", "lohnt": "", "crew": "", "disabled": True}

_SYSTEM = (
    "Du bist ein knapper deutschsprachiger Filmexperte. Antworte AUSSCHLIESSLICH mit "
    "einem JSON-Objekt mit den Schlüsseln 'plot' (2-3 Sätze Handlung, spoilerfrei), "
    "'lohnt' (ein Satz: für wen oder welche Stimmung sich der Film lohnt) und 'crew' "
    "(Regie und 2-3 Hauptdarsteller als ein String). Kein Markdown, nur das JSON-Objekt."
)


def synopsis(
    title: str, year: Optional[int] = None, original_title: Optional[str] = None
) -> Dict[str, Any]:
    """Return {plot, lohnt, crew}. Empty+disabled if no API key; empty on any error."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return dict(_DISABLED)
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        label = title
        if original_title and original_title != title:
            label += f" (Originaltitel: {original_title})"
        if year:
            label += f", {year}"
        resp = client.messages.create(
            model=_MODEL,
            max_tokens=400,
            system=[
                {"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}
            ],
            messages=[{"role": "user", "content": f"Film: {label}"}],
        )
        text = "".join(
            block.text for block in resp.content if getattr(block, "type", "") == "text"
        ).strip()
        data = _parse_json(text)
        return {
            "plot": data.get("plot", ""),
            "lohnt": data.get("lohnt", ""),
            "crew": data.get("crew", ""),
            "disabled": False,
        }
    except Exception as exc:  # noqa: BLE001 — any API/parse failure degrades gracefully
        logger.warning("AI synopsis failed for %s: %s", title, exc)
        return {"plot": "", "lohnt": "", "crew": "", "disabled": False, "error": str(exc)}


def _parse_json(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
    logger.warning("AI response was not valid JSON")
    return {}
