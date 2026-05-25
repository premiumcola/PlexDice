import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { navigate } from '../../router';
import { quizAnswer, quizAbandon } from '../../api';
import { loadRound, saveResults, clearRound } from './store';
import { MODE_PROMPT, fmt } from './util';

const DURATION = 15000;

function pointsFor(correct, timeMs) {
  if (!correct) return 0;
  const ms = timeMs == null ? DURATION : timeMs;
  if (ms <= 5000) return 100;
  if (ms <= 10000) return 80;
  if (ms <= 15000) return 60;
  return 0;
}

function OptionButton({ option, locked, chosen, reveal, onTap }) {
  let ring = 'ring-1 ring-zinc-700';
  let bg = 'bg-zinc-800';
  if (locked && reveal) {
    if (option.id === reveal.correctId) {
      ring = 'ring-2 ring-emerald-400';
      bg = 'bg-emerald-500/20';
    } else if (option.id === chosen) {
      ring = 'ring-2 ring-rose-500';
      bg = 'bg-rose-500/20';
    } else {
      bg = 'bg-zinc-800 opacity-50';
    }
  }
  const isImage = option.kind === 'image';
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onTap(option.id)}
      className={`relative rounded-2xl overflow-hidden ${ring} ${bg} text-left transition-all active:scale-[0.97] disabled:active:scale-100 ${isImage ? 'h-28 sm:h-36' : 'min-h-[80px] sm:min-h-[88px] p-3 flex flex-col justify-center'}`}
    >
      {isImage ? (
        <>
          {option.content ? (
            <img src={option.content} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-zinc-800" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/90 to-transparent px-2 py-1.5">
            <div className="text-xs sm:text-sm font-medium text-white truncate">{option.label}</div>
          </div>
        </>
      ) : (
        <>
          <div className="font-semibold text-zinc-100 text-base sm:text-lg leading-tight">{option.content}</div>
          {option.label && <div className="text-xs text-zinc-400 tabular-nums mt-0.5">{option.label}</div>}
        </>
      )}
    </button>
  );
}

export default function QuizPlay({ roundId }) {
  const round = useRef(loadRound(roundId)).current;
  const questions = round?.questions || [];

  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [remaining, setRemaining] = useState(DURATION);
  const [confirmExit, setConfirmExit] = useState(false);

  const startRef = useRef(Date.now());
  const answersRef = useRef([]);
  const advanceRef = useRef(null);

  const q = questions[index];

  const finish = useCallback(() => {
    saveResults(roundId, { score, size: questions.length, answers: answersRef.current });
    navigate(`/quiz/result/${roundId}`);
  }, [roundId, score, questions.length]);

  const handleAnswer = useCallback(
    (optionId) => {
      if (locked || !q) return;
      setLocked(true);
      const elapsed = Math.min(DURATION, Date.now() - startRef.current);
      const timeMs = optionId === null ? DURATION : elapsed;
      const correct = optionId === q.correct_option_id;
      const pts = pointsFor(correct, timeMs);
      setChosen(optionId);
      setReveal({ correctId: q.correct_option_id, correct });
      setScore((s) => s + pts);
      answersRef.current.push({ mode: q.mode, correct, points: pts, difficulty: q.difficulty });
      quizAnswer(roundId, { question_id: q.id, chosen_option_id: optionId, time_ms: timeMs }).catch(() => {});
      advanceRef.current = setTimeout(() => {
        if (index + 1 >= questions.length) finish();
        else {
          setIndex((i) => i + 1);
          setLocked(false);
          setChosen(null);
          setReveal(null);
        }
      }, 1200);
    },
    [locked, q, roundId, index, questions.length, finish],
  );

  // Per-question countdown.
  useEffect(() => {
    if (locked || !q) return undefined;
    startRef.current = Date.now();
    setRemaining(DURATION);
    const iv = setInterval(() => {
      const rem = DURATION - (Date.now() - startRef.current);
      if (rem <= 0) {
        setRemaining(0);
        handleAnswer(null);
      } else {
        setRemaining(rem);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [index, locked, q, handleAnswer]);

  // Keep the screen awake during play (best-effort).
  useEffect(() => {
    let lock;
    (async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* unsupported */
      }
    })();
    return () => {
      try {
        lock && lock.release();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ESC opens the abort confirmation.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setConfirmExit(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => clearTimeout(advanceRef.current), []);

  if (!round || !q) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-zinc-400">Runde nicht gefunden (oder Server neu gestartet).</p>
        <button type="button" onClick={() => navigate('/quiz')} className="px-5 py-3 rounded-xl bg-amber-400 text-zinc-950 font-semibold">
          Zurück zum Quiz
        </button>
      </div>
    );
  }

  const pct = (remaining / DURATION) * 100;
  const low = remaining <= 3000;
  const stemImage = q.stem.kind === 'image';

  const abort = async () => {
    clearTimeout(advanceRef.current);
    try {
      await quizAbandon(roundId);
    } catch {
      /* ignore */
    }
    clearRound(roundId);
    navigate('/quiz');
  };

  return (
    <div className="h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <style>{`@keyframes quizTitleFade {0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}`}</style>

      {/* Top bar */}
      <div className="shrink-0 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-400 tabular-nums">Frage {index + 1} von {questions.length}</span>
        <span className="text-sm font-semibold text-amber-400 tabular-nums">✨ {fmt(score)}</span>
        <button type="button" onClick={() => setConfirmExit(true)} aria-label="Runde abbrechen"
          className="w-9 h-9 rounded-lg bg-zinc-900 ring-1 ring-zinc-800 flex items-center justify-center active:scale-95">
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Countdown bar */}
      <div className="shrink-0 px-4 sm:px-6">
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: low ? '#ef4444' : '#f5a623', transition: 'width 0.1s linear' }}
          />
        </div>
      </div>

      {/* Prompt */}
      <div className="shrink-0 px-4 sm:px-6 pt-3 text-center text-sm text-zinc-400">
        {MODE_PROMPT[q.mode] || 'Frage'}
      </div>

      {/* Stem */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 py-3 flex items-center justify-center overflow-hidden">
        {stemImage ? (
          <img src={q.stem.content} alt="" className="max-h-full max-w-full object-contain rounded-2xl shadow-xl" />
        ) : (
          <div className="max-h-full overflow-auto rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 p-5 text-center">
            <p className="text-base sm:text-lg leading-relaxed text-zinc-200">{q.stem.content}</p>
          </div>
        )}
      </div>

      {/* Movie title reveal during the pause */}
      <div className="shrink-0 h-6 text-center">
        {locked && (
          <span className="text-sm font-medium text-zinc-300" style={{ animation: 'quizTitleFade 0.4s ease' }}>
            {q.movie_title}
          </span>
        )}
      </div>

      {/* Options */}
      <div className="shrink-0 px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {q.options.map((o) => (
            <OptionButton key={o.id} option={o} locked={locked} chosen={chosen} reveal={reveal} onTap={handleAnswer} />
          ))}
        </div>
      </div>

      {confirmExit && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 p-6 text-center">
            <p className="text-lg font-semibold mb-1">Runde abbrechen?</p>
            <p className="text-sm text-zinc-400 mb-5">Der Fortschritt geht verloren.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmExit(false)}
                className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-200 font-medium active:scale-[0.98] flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" /> Weiterspielen
              </button>
              <button type="button" onClick={abort}
                className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-medium active:scale-[0.98]">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
