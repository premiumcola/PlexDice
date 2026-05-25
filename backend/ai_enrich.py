"""Optional Anthropic-powered plot enrichment for a picked movie."""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"
_DISABLED: Dict[str, Any] = {
    "hot_take": "", "pros": [], "caveat": "", "fit": "", "plot": "", "disabled": True,
}

_SYSTEM = (
    "Du bist ein meinungsstarker, knapper deutschsprachiger Filmkritiker. Antworte "
    "AUSSCHLIESSLICH mit einem JSON-Objekt, kein Markdown und keine Einleitung. "
    "Verwende exakt diese Schlüssel:\n"
    "- 'hot_take': pointiertes Urteil in einem Satz, höchstens 12 Wörter, aktiv formuliert.\n"
    "- 'pros': genau 3 kurze Pluspunkte als Liste, je höchstens 7 Wörter.\n"
    "- 'caveat': ein ehrlicher Kritikpunkt, höchstens 10 Wörter.\n"
    "- 'fit': Ergänzung des Satzes \"Passt zu dir, wenn …\" OHNE diesen Vorspann.\n"
    "- 'plot': 2-3 Sätze neutrale, spoilerfreie Inhaltsangabe.\n"
    "Halte die Wortgrenzen strikt ein."
)


def synopsis(
    title: str, year: Optional[int] = None, original_title: Optional[str] = None
) -> Dict[str, Any]:
    """Return {hot_take, pros, caveat, fit, plot}. Empty+disabled without API key."""
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
            max_tokens=500,
            system=[
                {"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}
            ],
            messages=[{"role": "user", "content": f"Film: {label}"}],
        )
        text = "".join(
            block.text for block in resp.content if getattr(block, "type", "") == "text"
        ).strip()
        data = _parse_json(text)
        pros = data.get("pros") or []
        if isinstance(pros, str):
            pros = [pros]
        return {
            "hot_take": data.get("hot_take", ""),
            "pros": [str(p) for p in pros][:3],
            "caveat": data.get("caveat", ""),
            "fit": data.get("fit", ""),
            "plot": data.get("plot", ""),
            "disabled": False,
        }
    except Exception as exc:  # noqa: BLE001 — any API/parse failure degrades gracefully
        logger.warning("AI synopsis failed for %s: %s", title, exc)
        return {
            "hot_take": "", "pros": [], "caveat": "", "fit": "", "plot": "",
            "disabled": False, "error": str(exc),
        }


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
