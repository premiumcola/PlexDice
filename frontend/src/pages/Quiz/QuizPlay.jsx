import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, Check, X, ListChecks, Settings, Play, RotateCcw, LogOut } from 'lucide-react';
import { navigate } from '../../router';
import { quizAnswer, quizAbandon } from '../../api';
import { loadRound, saveResults, clearRound } from './store';
import { MODE_PROMPT, fmt } from './util';

const DURATION = 15000;

function basePoints(timeMs) {
  if (timeMs <= 5000) return 100;
  if (timeMs <= 10000) return 80;
  if (timeMs <= 15000) return 60;
  return 0;
}

function mmss(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function OptionButton({ option, multi, selected, locked, reveal, onTap }) {
  let ring = 'ring-1 ring-zinc-700';
  let bg = 'bg-zinc-800';
  if (!locked && multi && selected) {
    ring = 'ring-2 ring-amber-400';
    bg = 'bg-amber-400/15';
  }
  if (locked && reveal) {
    if (reveal.correctIds.includes(option.id)) {
      ring = 'ring-2 ring-emerald-400';
      bg = 'bg-emerald-500/20';
    } else if (reveal.chosenIds.has(option.id)) {
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
      className={`relative rounded-2xl overflow-hidden ${ring} ${bg} text-left transition-all active:scale-[0.97] disabled:active:scale-100 ${isImage ? 'h-24 sm:h-32 md:h-40 xl:h-44' : 'min-h-[64px] md:min-h-[80px] p-3 md:p-4 flex flex-col justify-center'}`}
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
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [locked, setLocked] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [multiSel, setMultiSel] = useState([]);
  const [remaining, setRemaining] = useState(DURATION);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  const startRef = useRef(Date.now());
  const roundStartRef = useRef(Date.now());
  const pausedRef = useRef(false);
  const pauseRemainRef = useRef(DURATION);
  const answersRef = useRef([]);
  const multiRef = useRef([]);
  const advanceRef = useRef(null);

  const q = questions[index];

  const finish = useCallback(() => {
    saveResults(roundId, { score, size: questions.length, answers: answersRef.current });
    navigate(`/quiz/result/${roundId}`);
  }, [roundId, score, questions.length]);

  const lockIn = useCallback(
    (chosenArr, timedOut = false) => {
      if (locked || !q) return;
      setLocked(true);
      const timeMs = timedOut ? DURATION : Math.min(DURATION, Date.now() - startRef.current);
      const chosenSet = new Set(chosenArr);
      let correct;
      let pts;
      let correctIds;
      let payload;
      if (q.multi_select) {
        correctIds = q.correct_option_ids || [];
        const hits = correctIds.filter((id) => chosenSet.has(id)).length;
        const wrong = chosenArr.filter((id) => !correctIds.includes(id)).length;
        const frac = Math.max(0, hits - wrong) / (correctIds.length || 1);
        pts = Math.round(basePoints(timeMs) * frac);
        correct = frac >= 1;
        payload = { question_id: q.id, chosen_option_ids: chosenArr, time_ms: timeMs };
      } else {
        correctIds = [q.correct_option_id];
        const id = chosenArr[0] ?? null;
        correct = id === q.correct_option_id;
        pts = correct ? basePoints(timeMs) : 0;
        payload = { question_id: q.id, chosen_option_id: id, time_ms: timeMs };
      }
      setReveal({ correctIds, chosenIds: chosenSet });
      setScore((s) => s + pts);
      if (correct) setCorrectCount((c) => c + 1);
      else setWrongCount((c) => c + 1);
      answersRef.current.push({ mode: q.mode, correct, points: pts, difficulty: q.difficulty });
      quizAnswer(roundId, payload).catch(() => {});
      advanceRef.current = setTimeout(() => {
        if (index + 1 >= questions.length) finish();
        else {
          setIndex((i) => i + 1);
          setLocked(false);
          setReveal(null);
          setMultiSel([]);
          multiRef.current = [];
        }
      }, 1200);
    },
    [locked, q, roundId, index, questions.length, finish],
  );

  const onOption = (id) => {
    if (locked || pausedRef.current) return;
    if (q.multi_select) {
      setMultiSel((sel) => {
        const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
        multiRef.current = next;
        return next;
      });
    } else {
      lockIn([id]);
    }
  };

  // Per-question countdown (frozen while paused).
  useEffect(() => {
    if (locked || !q) return undefined;
    startRef.current = Date.now();
    setRemaining(DURATION);
    const iv = setInterval(() => {
      if (pausedRef.current) return;
      const rem = DURATION - (Date.now() - startRef.current);
      if (rem <= 0) {
        setRemaining(0);
        lockIn(q.multi_select ? multiRef.current : [], true);
      } else {
        setRemaining(rem);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [index, locked, q, lockIn]);

  // Round elapsed timer — keeps ticking even when paused.
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - roundStartRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

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

  const doPause = useCallback(() => {
    pauseRemainRef.current = remaining;
    pausedRef.current = true;
    setPaused(true);
  }, [remaining]);

  const resume = () => {
    startRef.current = Date.now() - (DURATION - pauseRemainRef.current);
    pausedRef.current = false;
    setPaused(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') doPause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doPause]);

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
  const gridCols = q.options.length > 4 ? 'grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 xl:grid-cols-4';
  const remainingCount = Math.max(0, questions.length - index - 1);

  const leave = async (to) => {
    clearTimeout(advanceRef.current);
    try {
      await quizAbandon(roundId);
    } catch {
      /* ignore */
    }
    clearRound(roundId);
    navigate(to);
  };

  return (
    <div className="h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <style>{`@keyframes quizTitleFade {0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}`}</style>

      {/* HUD */}
      <div
        className="shrink-0 sticky top-0 z-30 flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
        style={{ background: 'rgba(9,9,11,0.7)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      >
        <span className="flex items-center gap-1 font-mono tabular-nums text-sm text-zinc-200"><Timer className="w-4 h-4 text-zinc-400" /> {mmss(elapsed)}</span>
        <span className="flex items-center gap-1 text-sm tabular-nums text-emerald-400"><Check className="w-4 h-4" /> {correctCount}</span>
        <span className="flex items-center gap-1 text-sm tabular-nums text-rose-400"><X className="w-4 h-4" /> {wrongCount}</span>
        <span className="flex items-center gap-1 text-sm tabular-nums text-zinc-300 ml-auto"><ListChecks className="w-4 h-4" /> {remainingCount}</span>
        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-amber-400">✨ {fmt(score)}</span>
        <button type="button" onClick={doPause} aria-label="Pause" className="w-9 h-9 rounded-lg bg-zinc-800/80 flex items-center justify-center active:scale-95">
          <Settings className="w-4 h-4 text-zinc-300" />
        </button>
      </div>

      {/* Countdown bar */}
      <div className="shrink-0 px-4 sm:px-6 pt-2">
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: low ? '#ef4444' : '#f5a623', transition: 'width 0.1s linear' }} />
        </div>
      </div>

      <div className="shrink-0 px-4 sm:px-6 pt-3 text-center text-sm md:text-base text-zinc-400">{MODE_PROMPT[q.mode] || 'Frage'}</div>

      <div className="flex-1 min-h-0 px-4 sm:px-6 py-3 flex items-center justify-center overflow-hidden">
        {stemImage ? (
          <img src={q.stem.content} alt="" className="max-h-full max-w-full md:max-w-md object-contain rounded-2xl shadow-xl" />
        ) : (
          <div className="max-h-full max-w-2xl overflow-auto rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 p-5 md:p-6 text-center">
            <p className="text-base sm:text-lg md:text-xl leading-relaxed text-zinc-200">{q.stem.content}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 h-6 text-center">
        {locked && (
          <span className="text-sm font-medium text-zinc-300" style={{ animation: 'quizTitleFade 0.4s ease' }}>{q.movie_title}</span>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 w-full max-w-5xl mx-auto">
        <div className={`grid ${gridCols} gap-2 sm:gap-3`}>
          {q.options.map((o) => (
            <OptionButton key={o.id} option={o} multi={q.multi_select} selected={multiSel.includes(o.id)} locked={locked} reveal={reveal} onTap={onOption} />
          ))}
        </div>
        {q.multi_select && !locked && (
          <button type="button" onClick={() => lockIn(multiSel)}
            className="mt-3 w-full py-3 rounded-xl bg-amber-400 text-zinc-950 font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
            disabled={multiSel.length === 0}>
            Bestätigen ({multiSel.length})
          </button>
        )}
      </div>

      {paused && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 p-6 text-center">
            <p className="font-display-tight text-2xl mb-1">Pausiert</p>
            <p className="text-sm text-zinc-400 mb-5">Frage pausiert · Gesamtzeit läuft weiter.</p>
            <div className="space-y-2">
              <button type="button" onClick={resume} className="w-full py-3 rounded-xl bg-amber-400 text-zinc-950 font-semibold flex items-center justify-center gap-2"><Play className="w-4 h-4 fill-zinc-950" /> Weiter</button>
              <button type="button" onClick={() => leave('/quiz/setup')} className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-200 font-medium flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Neu starten</button>
              <button type="button" onClick={() => leave('/quiz')} className="w-full py-3 rounded-xl bg-rose-500/90 text-white font-medium flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> Beenden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
