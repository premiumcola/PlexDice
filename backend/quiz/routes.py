"""Flask blueprint /api/quiz/* — round lifecycle, history, per-movie stats."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, send_file

from quiz import photos
from quiz.generator import QuizGenerator
from quiz.history import History
from quiz.session import SessionStore
from services import DATA_DIR, library_cache

logger = logging.getLogger(__name__)
bp = Blueprint("quiz", __name__, url_prefix="/api/quiz")

sessions = SessionStore()
history = History(
    os.path.join(DATA_DIR, "quiz_history.json"),
    os.path.join(DATA_DIR, "quiz_movie_stats.json"),
)

# Remove photo files no round references anymore (runs once on boot).
try:
    photos.cleanup_orphans(history.all_photo_ids())
except Exception:  # noqa: BLE001
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _readable(option: dict | None) -> str | None:
    """Human-readable answer text from an option (title/name)."""
    if not option:
        return None
    return option.get("content") if option.get("kind") == "text" else option.get("label")


@bp.post("/round/new")
def new_round():
    body = request.get_json(silent=True) or {}
    size = max(1, min(int(body.get("size") or 50), 200))
    modes = body.get("modes")
    name = (body.get("name") or "").strip() or None

    status = library_cache.status()
    generator = QuizGenerator(library_cache.movies(), cast_enriched=status.get("cast_enriched", False))
    questions, meta = generator.build_round(size, modes)
    if not questions:
        return jsonify({"error": "Nicht genug Daten für ein Quiz"}), 400

    session = sessions.create(questions, name, meta["modes"])
    return jsonify(
        {
            "round_id": session.round_id,
            "questions": questions,
            "created_at": session.created_at,
            "size": len(questions),
            "modes": meta["modes"],
            "insufficient_cast": meta["insufficient_cast"],
        }
    )


@bp.post("/round/<round_id>/answer")
def answer(round_id: str):
    session = sessions.get(round_id)
    if not session:
        return jsonify({"error": "round not found"}), 404
    body = request.get_json(silent=True) or {}
    result = session.record(
        body.get("question_id"), body.get("chosen_option_id"), body.get("time_ms")
    )
    if result is None:
        return jsonify({"error": "question not found"}), 404
    return jsonify(result)


@bp.post("/round/<round_id>/complete")
def complete(round_id: str):
    session = sessions.get(round_id)
    if not session:
        return jsonify({"error": "round not found"}), 404
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or session.name or "Runde").strip()
    questions_out = []
    for q in session.questions:
        ans = session.answers.get(q["id"], {})
        options = {o["id"]: o for o in q.get("options", [])}
        chosen_id = ans.get("chosen_option_id")
        questions_out.append(
            {
                "id": q["id"],
                "mode": q["mode"],
                "difficulty": q.get("difficulty"),
                "movie_key": q["movie_key"],
                "movie_title": q.get("movie_title"),
                "movie_year": q.get("movie_year"),
                "correct": bool(ans.get("correct", False)),
                "chosen_option_id": chosen_id,
                "chosen_text": _readable(options.get(chosen_id)),
                "correct_text": _readable(options.get(q.get("correct_option_id"))),
                "time_ms": ans.get("time_ms"),
            }
        )
    record = {
        "id": session.round_id,
        "name": name,
        "player_names": body.get("player_names") or [],
        "photo_id": body.get("photo_id"),
        "created_at": session.created_at,
        "finished_at": _now(),
        "size": len(session.questions),
        "score": session.score,
        "modes": session.modes,
        "questions": questions_out,
    }
    history.add_round(record)
    sessions.drop(round_id)
    return jsonify(record)


@bp.delete("/round/<round_id>")
def abandon(round_id: str):
    sessions.drop(round_id)
    return jsonify({"ok": True})


@bp.get("/history")
def history_list():
    return jsonify({"rounds": history.list_rounds()})


@bp.get("/history/top")
def history_top():
    return jsonify({"movies": history.top_movies(10)})


@bp.get("/history/<round_id>")
def history_get(round_id: str):
    record = history.get_round(round_id)
    if not record:
        return jsonify({"error": "not found"}), 404
    keys = {q.get("movie_key") for q in record.get("questions", [])}
    stats = {k: history.movie_stats(k).get("attempts", []) for k in keys if k}
    return jsonify({**record, "movie_stats": stats})


@bp.delete("/history/<round_id>")
def history_delete(round_id: str):
    record = history.delete_round(round_id)
    if not record:
        return jsonify({"error": "not found"}), 404
    photos.delete(record.get("photo_id"))
    return jsonify({"ok": True})


@bp.get("/movie/<movie_key>/stats")
def movie_stats(movie_key: str):
    return jsonify(history.movie_stats(movie_key))


@bp.post("/photo")
def upload_photo():
    file = request.files.get("photo") or request.files.get("file")
    if not file:
        return jsonify({"error": "no file"}), 400
    try:
        photo_id = photos.save(file)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Photo upload failed: %s", exc)
        return jsonify({"error": "invalid image"}), 400
    return jsonify({"photo_id": photo_id, "url": f"/api/quiz/photo/{photo_id}"})


@bp.get("/photo/<photo_id>")
def get_photo(photo_id: str):
    width = request.args.get("w", type=int)
    width = width if width and 0 < width <= 1200 else None
    path = photos.get_path(photo_id, width)
    if not path:
        return jsonify({"error": "not found"}), 404
    response = send_file(path, mimetype="image/jpeg")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response
