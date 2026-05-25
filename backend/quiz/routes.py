"""Flask blueprint /api/quiz/* — round lifecycle, history, per-movie stats."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from quiz.generator import QuizGenerator
from quiz.history import History
from quiz.session import SessionStore
from services import DATA_DIR, library_cache

bp = Blueprint("quiz", __name__, url_prefix="/api/quiz")

sessions = SessionStore()
history = History(
    os.path.join(DATA_DIR, "quiz_history.json"),
    os.path.join(DATA_DIR, "quiz_movie_stats.json"),
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        questions_out.append(
            {
                "id": q["id"],
                "mode": q["mode"],
                "movie_key": q["movie_key"],
                "movie_title": q.get("movie_title"),
                "correct": bool(ans.get("correct", False)),
                "chosen_option_id": ans.get("chosen_option_id"),
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
    return jsonify(record)


@bp.delete("/history/<round_id>")
def history_delete(round_id: str):
    record = history.delete_round(round_id)
    if not record:
        return jsonify({"error": "not found"}), 404
    # Photo file cleanup is wired in the N4 task.
    try:
        from quiz import photos  # noqa: WPS433 — optional until N4 lands

        if record.get("photo_id"):
            photos.delete(record["photo_id"])
    except Exception:  # noqa: BLE001
        pass
    return jsonify({"ok": True, "photo_id": record.get("photo_id")})


@bp.get("/movie/<movie_key>/stats")
def movie_stats(movie_key: str):
    return jsonify(history.movie_stats(movie_key))
