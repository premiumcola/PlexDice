import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Timer, Check, X, Pause, Play, RotateCcw, LogOut, MousePointerClick } from 'lucide-react';
import { navigate } from '../../router';
import { quizAnswer, quizAbandon, quizState } from '../../api';
import { loadRound, saveResults, clearRound } from './store';
import { MODE_PROMPT, TIER_LABEL, STEM_IS_PERSON, OPTIONS_ARE_PERSONS, panelOnRight, fmt } from './util';
import Fireworks from '../../components/Fireworks';
import { usePrefs } from '../../usePrefs';

const TIER_DOT = { 1: '#34d399', 2: '#f5a623', 3: '#fb7185' }; // emerald / amber / rose
// Timeline chip difficulty pip — Tailwind bg classes (emerald / amber / rose-400).
const TIER_PIP = { 1: 'bg-emerald-400', 2: 'bg-amber-400', 3: 'bg-rose-400' };

// Three pips + tier label, for the light Stage HUD. No lucide icon by design.
function DifficultyBadge({ tier }) {
  const dot = TIER_DOT[tier] || '#a1a1aa';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={i <= tier ? { background: dot } : { border: '1px solid #d4d4d8' }}
          />
        ))}
      </span>
      <span className="hidden sm:inline text-zinc-600">{TIER_LABEL[tier]}</span>
    </span>
  );
}
import { initAudio, playSound, preloadSounds, setSoundEnabled } from './audio';
import RadialCountdown from './RadialCountdown';

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

// A short text stem (a "pill" — the "A & B" two-stars line, "Drehbuch: <name>", …)
// needs no tall Stage; shrink it so the cover options claim the lower viewport. Long
// text stems (plot / tagline / redacted plot) stay tall.
function stemIsShortText(q) {
  if (q.stem?.kind !== 'text') return false;
  const text = String(q.stem.content || '').trim();
  if (!text) return false;
  const PILL_MODES = new Set([
    'two_actors_to_shared',
    'writer_to_movie',
    'slogan_to_movie',
  ]);
  if (PILL_MODES.has(q.mode)) return true;
  // Belt-and-braces: any TEXT stem under 60 chars counts as a pill.
  return text.length <= 60;
}

// Backend marks each redacted plot word as ⁣[REDACT:n]⁣ (invisible separators
// as parser anchors). Split on that and render each as a fixed-width bar sized to the
// hidden word — a deliberate redaction, never a missing-font tofu box.
function renderRedactedPlot(text) {
  const re = /⁣\[REDACT:(\d+)\]⁣/g;
  const nodes = [];
  let last = 0;
  let key = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const n = Math.max(2, parseInt(m[1], 10) || 3);
    nodes.push(<span key={`r${key++}`} className="redact-block" style={{ width: `${n}ch` }} aria-label="zensiert" />);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Dark-Panel option. Unselected = zinc; selected (not locked) = amber outline;
// reveal = emerald (correct) / rose (wrong chosen).
function OptionButton({ option, mode, fill, selected, locked, reveal, onTap, hint, btnRef, flash }) {
  let cls = 'border border-zinc-700 bg-zinc-800/60 text-zinc-100';
  let anim;
  if (!locked && selected) {
    // Unmistakable selection: thick amber ring, deeper fill, outer glow and a subtle
    // lift. The lift rides on transform so neighbour chips never reflow.
    cls =
      'ring-[3px] ring-amber-400 bg-amber-400/22 text-amber-200 shadow-[0_0_24px_rgba(245,166,35,0.45)] scale-[1.025]';
  }
  if (locked && reveal) {
    const isCorrect = reveal.correctIds.includes(option.id);
    const isChosen = reveal.chosenIds.has(option.id);
    if (isCorrect) {
      cls = 'border-2 border-emerald-400 bg-emerald-500/20 text-zinc-100';
      if (isChosen) anim = 'pfCorrect 0.4s ease';
    } else if (isChosen) {
      cls = 'border-2 border-rose-500 bg-rose-500/20 text-zinc-100';
      anim = 'pfWrong 0.3s ease';
    } else {
      cls = 'border border-zinc-700 bg-zinc-800/60 text-zinc-100 opacity-50';
    }
  }
  const isImage = option.kind === 'image';
  // Aspect from the option (16/9 art, 1/1 face, 2/3 poster); else square for person
  // options (headshots bottom-crop in a 2:3 cell), 2/3 for everything else.
  const imageBox =
    option.aspect === '16/9' ? 'aspect-video w-full'
      : option.aspect === '1/1' ? 'aspect-square w-full'
        : option.aspect === '2/3' ? 'aspect-[2/3] w-full'
          : OPTIONS_ARE_PERSONS.has(mode) ? 'aspect-square w-full'
            : 'aspect-[2/3] w-full';
  // Text options: in a text-only grid they stretch to fill the cell (big, centered);
  // otherwise (a rare text fallback among images) they stay compact and left-aligned.
  const textBox = fill
    ? 'h-full p-4 md:p-6 flex flex-col items-center justify-center text-center'
    : 'min-h-[64px] p-3 md:p-4 flex flex-col justify-center text-left';
  return (
    <button
      ref={btnRef}
      type="button"
      disabled={locked}
      onClick={() => onTap(option.id)}
      style={{ animation: anim || 'none' }}
      className={`relative rounded-2xl overflow-hidden ${cls} transition-all duration-[120ms] ease-out active:scale-[0.97] disabled:active:scale-100 ${isImage ? imageBox : textBox} ${flash ? 'animate-quizCardFlash' : ''}`}
    >
      {isImage ? (
        <>
          {option.content ? (
            <img src={option.content} alt="" className={`absolute inset-0 w-full h-full object-cover ${OPTIONS_ARE_PERSONS.has(mode) ? 'object-top' : 'object-center'}`} />
          ) : (
            <div className="absolute inset-0 bg-zinc-800" />
          )}
          {(OPTIONS_ARE_PERSONS.has(mode) || option.show_label) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/90 to-transparent px-2 py-1.5">
              <div className="text-xs sm:text-sm font-medium text-white truncate">{option.label}</div>
            </div>
          )}
          {selected && !locked && hint && (
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 overflow-hidden bg-amber-500/85 px-2 py-1 text-[11px] font-medium text-zinc-950"
              style={{ maxHeight: '22%', animation: 'pfHintIn 0.15s ease' }}
            >
              <MousePointerClick className="w-3 h-3 shrink-0" />
              <span className="truncate">Nochmal tippen zum Bestätigen</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className={`font-semibold leading-tight ${fill ? 'text-lg md:text-2xl tabular-nums' : 'text-base sm:text-lg'}`}>{option.content}</div>
          {option.label && <div className="text-xs text-zinc-400 tabular-nums mt-0.5">{option.label}</div>}
          {selected && !locked && hint && (
            <div
              className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-medium uppercase tracking-wide text-amber-300/90"
              style={{ animation: 'pfHintIn 0.15s ease' }}
            >
              <MousePointerClick className="w-3 h-3 shrink-0" />
              Nochmal tippen zum Bestätigen
            </div>
          )}
        </>
      )}
    </button>
  );
}

// Per-question status for the timeline chip. Active beats every resolved state.
function chipState(st, isActive) {
  if (isActive) return 'active';
  if (!st) return 'idle';
  if (st.forced_resolve) return 'forced';
  if (st.resolved) return st.first_try_correct ? 'first' : 'retry_done';
  if (st.attempts > 0) return 'retry';
  return 'idle';
}

const CHIP_CLASS = {
  first: 'bg-emerald-500 text-zinc-950 ring-1 ring-emerald-400',
  retry_done: 'bg-amber-400 text-zinc-950 ring-1 ring-amber-300',
  retry: 'bg-rose-500 text-white ring-1 ring-rose-400',
  forced: 'bg-zinc-400 text-zinc-900 ring-1 ring-zinc-300 line-through',
  idle: 'text-zinc-400 ring-1 ring-zinc-400/50',
};

const CHIP_LABEL = {
  active: 'aktiv',
  first: 'beim ersten Versuch gelöst',
  retry_done: 'nach Wiederholung gelöst',
  retry: 'in Wiederholungs-Runde',
  forced: 'übersprungen',
  idle: 'offen',
};

// Read-only progress chips, one per question. Vertical rail on md+, collapsed
// horizontal strip on iPhone. Chips are circles, sized so the whole set always fits
// without a scrollbar; the active chip breathes gently, then blinks sharply rose
// once time is critical (≤ 5 s) to telegraph the pressure.
function QuestionTimeline({ questions, statusMap, currentQid, layout, remainingMs, durationMs }) {
  const rail = layout === 'rail';
  const n = questions.length || 1;
  const critical =
    remainingMs != null && (remainingMs <= 5000 || remainingMs / (durationMs || 15000) < 5 / 15);

  const stripRef = useRef(null);
  const currentRef = useRef(null);
  const [innerW, setInnerW] = useState(0);

  // Measure the strip's inner width (iPhone only) before paint, and on resize.
  useLayoutEffect(() => {
    if (rail) return undefined;
    const measure = () => {
      const el = stripRef.current;
      if (!el) return;
      const cs = window.getComputedStyle(el);
      const pad = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
      setInnerW(Math.max(0, el.clientWidth - pad));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [rail]);

  // Keep the current chip centred when the strip scrolls (focus / overflow mode).
  useEffect(() => {
    if (rail) return;
    currentRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [rail, currentQid, innerW]);

  // One chip. `px`/`fontPx` may be a number (strip) or a CSS clamp string (rail).
  const chip = (qq, i, px, fontPx) => {
    const state = chipState(statusMap[qq.id], qq.id === currentQid);
    const isActive = state === 'active';
    const tier = qq.tier || qq.difficulty || 1;
    const showRetry = state === 'retry' || state === 'retry_done';
    const cls = isActive
      ? critical
        ? 'bg-rose-500 text-white ring-2 ring-rose-300'
        : 'ring-2 ring-amber-400 text-amber-600 bg-amber-400/15'
      : CHIP_CLASS[state];
    const anim = isActive
      ? critical
        ? 'pfChipBlink 0.35s ease-in-out infinite'
        : 'pfChipPulse 1.4s ease-in-out infinite'
      : undefined;
    const label = `Frage ${i + 1} · Tier ${tier} (${TIER_LABEL[tier] || '?'}) · ${CHIP_LABEL[state]}`;
    return (
      <div
        key={qq.id}
        ref={!rail && isActive ? currentRef : undefined}
        title={label}
        aria-label={label}
        style={{ width: px, height: px, fontSize: fontPx, animation: anim, scrollSnapAlign: 'center' }}
        className={`relative shrink-0 rounded-full flex items-center justify-center font-semibold tabular-nums ${cls}`}
      >
        {i + 1}
        <span
          aria-hidden="true"
          className={`absolute rounded-full ring-1 ring-zinc-950 ${TIER_PIP[tier] || 'bg-zinc-400'}`}
          style={{ width: 6, height: 6, right: -1, bottom: -1 }}
        />
        {showRetry && (
          <RotateCcw aria-hidden="true" className="absolute text-amber-500" style={{ width: 8, height: 8, right: -2, top: -2 }} />
        )}
      </div>
    );
  };

  // Collapsed 8 px tier dot for resolved questions in focus mode.
  const dot = (qq, i, tier, state) => {
    const label = `Frage ${i + 1} · Tier ${tier} (${TIER_LABEL[tier] || '?'}) · ${CHIP_LABEL[state]}`;
    return (
      <div
        key={qq.id}
        title={label}
        aria-label={label}
        style={{ width: 8, height: 8, scrollSnapAlign: 'center' }}
        className={`shrink-0 rounded-full ${TIER_PIP[tier] || 'bg-zinc-400'}`}
      />
    );
  };

  if (rail) {
    const size = `clamp(14px, calc((100dvh - 6rem) / ${n}), 32px)`;
    const fontSize = `clamp(9px, calc((100dvh - 6rem) / ${n} * 0.42), 14px)`;
    const avail = (typeof window !== 'undefined' ? window.innerHeight : 800) - 96;
    const gap = Math.max(14, Math.min(32, avail / n)) < 24 ? 'gap-1' : 'gap-1.5';
    return (
      <div
        aria-label="Fragen-Fortschritt"
        className={`hidden md:flex absolute inset-y-0 left-0 z-20 w-16 flex-col items-center justify-center ${gap} bg-zinc-950 border-r border-amber-500/40 py-3`}
      >
        {questions.map((qq, i) => chip(qq, i, size, fontSize))}
      </div>
    );
  }

  // iPhone strip. Stage A: uniform size that fits the measured width; below the 14 px
  // floor, Stage B "focus mode" collapses done chips to dots and emphasises the current.
  const GAP = 4; // gap-1
  const uniform = innerW > 0 ? Math.floor((innerW - (n - 1) * GAP) / n) : 28;
  // py-1.5 gives the active chip's pulse ring room so it isn't clipped at the strip edge.
  const base = 'md:hidden shrink-0 flex items-center gap-1 py-1.5 bg-zinc-100 border-b border-amber-500/50';
  const pad = { paddingInline: 'max(8px, env(safe-area-inset-left))' };

  if (uniform >= 14) {
    const px = Math.min(28, uniform);
    const fontPx = Math.max(8, Math.round(px * 0.42));
    return (
      <div ref={stripRef} aria-label="Fragen-Fortschritt" className={`${base} justify-center`} style={pad}>
        {questions.map((qq, i) => chip(qq, i, px, fontPx))}
      </div>
    );
  }

  // Stage B — focus: done → 8 px dots, retry/upcoming → 16 px, current → 28 px.
  let total = 0;
  const nodes = questions.map((qq, i) => {
    const state = chipState(statusMap[qq.id], qq.id === currentQid);
    const tier = qq.tier || qq.difficulty || 1;
    const done = state === 'first' || state === 'retry_done' || state === 'forced';
    const px = state === 'active' ? 28 : done ? 8 : 16;
    total += px;
    return done ? dot(qq, i, tier, state) : chip(qq, i, px, Math.max(8, Math.round(px * 0.42)));
  });
  total += (n - 1) * GAP;
  const scroll = innerW > 0 && total > innerW;

  return (
    <div
      ref={stripRef}
      aria-label="Fragen-Fortschritt"
      className={`${base} ${scroll ? 'justify-start overflow-x-auto overflow-y-visible' : 'justify-center'}`}
      style={scroll ? { ...pad, scrollSnapType: 'x mandatory', scrollPaddingInline: '50%' } : pad}
    >
      {nodes}
    </div>
  );
}

export default function QuizPlay({ roundId }) {
  const round = useRef(loadRound(roundId)).current;
  const questions = round?.questions || [];
  const dur = (round?.countdown_seconds || 15) * 1000;
  const soundOn = round?.sound_enabled !== false;
  const autoreveal = round?.autoreveal_delay_ms || 1200;
  const showCorrect = round?.show_correct_on_wrong !== false;

  const total = questions.length;
  const byId = useRef(Object.fromEntries(questions.map((qq) => [qq.id, qq]))).current;

  const [currentQid, setCurrentQid] = useState(questions[0]?.id || null);
  const [visit, setVisit] = useState('first');
  const [visitSeq, setVisitSeq] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [statusMap, setStatusMap] = useState({});
  const [toast, setToast] = useState(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [locked, setLocked] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [remaining, setRemaining] = useState(dur);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState(false);
  const { reduceMotion } = usePrefs();
  const correctOptionRef = useRef(null);
  const [fireworksOrigin, setFireworksOrigin] = useState(null);
  const [fireworksKey, setFireworksKey] = useState(0);
  const [showCardFlash, setShowCardFlash] = useState(false);
  const [showPageWash, setShowPageWash] = useState(false);
  const [roundTwoIntroShown, setRoundTwoIntroShown] = useState(false);
  const [showRoundTwoIntro, setShowRoundTwoIntro] = useState(false);
  const [roundTwoCountdown, setRoundTwoCountdown] = useState(3);

  const startRef = useRef(Date.now());
  const roundStartRef = useRef(Date.now());
  const pausedRef = useRef(false);
  const pauseRemainRef = useRef(dur);
  const lastSecRef = useRef(null);
  const answersRef = useRef([]);
  const selectedRef = useRef([]);
  const lastTapRef = useRef({ id: null, ts: 0 });
  const advanceRef = useRef(null);
  const toastRef = useRef(null);
  const scoreRef = useRef(0);
  const introActiveRef = useRef(false); // true while the round-2 overlay freezes the timer
  const roundTwoTimerRef = useRef(null);

  const q = byId[currentQid];

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Mastery rounds end only when every question is resolved; pull the final stats
  // from the (still-alive) server session so the result screen can show them.
  const finish = useCallback(async () => {
    let stats = null;
    try {
      const st = await quizState(roundId);
      stats = st?.stats || null;
    } catch {
      /* round gone / offline — fall back to client tallies */
    }
    saveResults(roundId, {
      score: stats?.score ?? scoreRef.current,
      size: total,
      stats,
      answers: answersRef.current,
    });
    navigate(`/quiz/result/${roundId}`);
  }, [roundId, total]);

  // Close the round-2 overlay (countdown done or tapped) and hand the retry
  // question its full clock — the timer stayed frozen while the overlay was up.
  const dismissRoundTwoIntro = useCallback(() => {
    if (roundTwoTimerRef.current) {
      clearInterval(roundTwoTimerRef.current);
      roundTwoTimerRef.current = null;
    }
    introActiveRef.current = false;
    startRef.current = Date.now();
    setRemaining(dur);
    setShowRoundTwoIntro(false);
  }, [dur]);

  // Announce the retry pool with a 3 → 2 → 1 countdown, then reveal the question.
  const startRoundTwoIntro = useCallback(() => {
    setRoundTwoIntroShown(true);
    setShowRoundTwoIntro(true);
    if (soundOn) playSound('drumroll');
    setRoundTwoCountdown(3);
    introActiveRef.current = true; // read inside the question-timer interval to pause it
    if (roundTwoTimerRef.current) clearInterval(roundTwoTimerRef.current);
    let n = 3;
    roundTwoTimerRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) dismissRoundTwoIntro();
      else setRoundTwoCountdown(n);
    }, 900);
  }, [dismissRoundTwoIntro]);

  // Advance to whatever the server serves next (a first visit or a retry), or
  // finish once the round is fully resolved.
  const applyNext = useCallback(
    (resp) => {
      if (!resp) {
        finish();
        return;
      }
      if (resp.status) setStatusMap(resp.status);
      if (typeof resp.resolved_count === 'number') setResolvedCount(resp.resolved_count);
      if (typeof resp.current_score === 'number') {
        setScore(resp.current_score);
        scoreRef.current = resp.current_score;
      }
      if (resp.forced_resolve) showToast('Frage übersprungen nach 5 Versuchen');
      if (resp.done || !resp.next) {
        finish();
        return;
      }
      const nextVisit = resp.next.visit || 'first';
      setCurrentQid(resp.next.question_id);
      setVisit(nextVisit);
      setVisitSeq((n) => n + 1);
      setLocked(false);
      setReveal(null);
      setSelectedIds([]);
      selectedRef.current = [];
      lastTapRef.current = { id: null, ts: 0 };
      // First retry of the session → announce round 2 (timer paused until dismissed).
      if (nextVisit === 'retry' && !roundTwoIntroShown) startRoundTwoIntro();
    },
    [finish, showToast, roundTwoIntroShown, startRoundTwoIntro],
  );

  const lockIn = useCallback(
    (chosenArr, timedOut = false) => {
      if (locked || !q) return;
      setLocked(true);
      const timeMs = timedOut ? dur : Math.min(dur, Date.now() - startRef.current);
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
      setReveal({ correctIds: correct || showCorrect ? correctIds : [], chosenIds: chosenSet });
      if (correct) setCorrectCount((c) => c + 1);
      else setWrongCount((c) => c + 1);
      answersRef.current.push({ mode: q.mode, correct, points: pts, difficulty: q.difficulty });
      if (soundOn) playSound(correct ? 'correct' : 'loser');
      if (correct && !reduceMotion) {
        // Rockets launch from the correct card's centre and explode upward; the card
        // flickers multi-colour and a brief emerald wash flashes once. ≤ 2 s total.
        const el = correctOptionRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          setFireworksOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
          setFireworksKey((k) => k + 1);
          setShowCardFlash(true);
          setShowPageWash(true);
          setTimeout(() => setShowCardFlash(false), 900);
          setTimeout(() => setShowPageWash(false), 280);
          setTimeout(() => setFireworksOrigin(null), 2000);
        }
      }
      if (timedOut) {
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
      }
      // The server response decides what comes next (retry order is server-side).
      const answerPromise = quizAnswer(roundId, payload).catch(() => null);
      advanceRef.current = setTimeout(async () => {
        applyNext(await answerPromise);
      }, autoreveal);
    },
    [locked, q, roundId, applyNext, dur, soundOn, showCorrect, autoreveal, reduceMotion],
  );

  const onOption = (id) => {
    if (locked || pausedRef.current) return;
    initAudio();
    if (q.multi_select) {
      if (soundOn) playSound('click');
      setSelectedIds((sel) => {
        const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
        selectedRef.current = next;
        return next;
      });
      return;
    }
    // Single-select: first tap marks the option, a second tap on the SAME option
    // confirms (this replaces the old Bestätigen button). Ignore a second tap within
    // 120 ms of the first as an accidental fat-finger double-tap.
    const now = Date.now();
    const isMarked = selectedRef.current.length === 1 && selectedRef.current[0] === id;
    if (isMarked) {
      if (now - lastTapRef.current.ts < 120) return;
      lockIn([id]);
      return;
    }
    if (soundOn) playSound('click');
    lastTapRef.current = { id, ts: now };
    selectedRef.current = [id];
    setSelectedIds([id]);
  };

  // Decode all sounds up front (zero first-tick latency) and gate them on this round's
  // Sound setting so playSound honours it even from the timer interval.
  useEffect(() => { preloadSounds(); setSoundEnabled(soundOn); }, [soundOn]);

  useEffect(() => {
    if (locked || !q) return undefined;
    startRef.current = Date.now();
    lastSecRef.current = null;
    setRemaining(dur);
    const iv = setInterval(() => {
      if (pausedRef.current || introActiveRef.current) return;
      const rem = dur - (Date.now() - startRef.current);
      if (rem <= 0) {
        setRemaining(0);
        if (soundOn) playSound('alarm');
        lockIn(selectedRef.current, true);
        return;
      }
      setRemaining(rem);
      // One sound per whole second as it counts down: tick at 10→6, bomb at 5→1.
      const sec = Math.ceil(rem / 1000);
      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec;
        if (soundOn) {
          if (sec >= 6 && sec <= 10) playSound('tick');
          else if (sec >= 1 && sec <= 5) playSound('bomb');
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [visitSeq, locked, q, lockIn, dur, soundOn]);

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
    startRef.current = Date.now() - (dur - pauseRemainRef.current);
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

  useEffect(
    () => () => {
      clearTimeout(advanceRef.current);
      clearTimeout(toastRef.current);
      clearInterval(roundTwoTimerRef.current);
    },
    [],
  );

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

  const stemImage = q.stem.kind === 'image';
  // Stem aspect comes from the backend (16/9 backdrops, 1/1 faces); default 2/3 posters.
  const stemAspect = q.stem.aspect || (STEM_IS_PERSON.has(q.mode) ? '1/1' : '2/3');
  const stemAspectClass =
    stemAspect === '16/9' ? 'aspect-[16/9]' : stemAspect === '1/1' ? 'aspect-square' : 'aspect-[2/3]';
  const stemLandscape = stemAspect === '16/9';
  // A short "pill" text stem shrinks the Stage so the cover options fill the Panel
  // below; it stays panel-below on every breakpoint (never side-by-side).
  const shortStage = stemIsShortText(q);
  // md+ only: tall image options claim the full-height stage on the right so covers
  // never clip; pill stems and multi-select trays sit below regardless.
  const wantsRight = panelOnRight(q) && !shortStage;
  // A text-only option grid stretches to fill the Panel; image grids keep their aspect.
  const textOptions = q.options.every((o) => o.kind === 'text');
  const gridCols = q.options.length > 4 ? 'grid-cols-3' : 'grid-cols-2';
  const vignette = remaining <= 5000 && !locked;

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
    <div className={`h-[100dvh] flex flex-col overflow-hidden relative md:pl-[68px] ${wantsRight ? 'md:flex-row' : ''}`}>
      <style>{`
        @keyframes quizTitleFade {0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes pfVignette {0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes pfSlideUp {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pfCorrect {0%,100%{transform:scale(1)}40%{transform:scale(1.05)}}
        @keyframes pfWrong {0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
        @keyframes pfHintIn {from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {vignette && (
        <div className="pointer-events-none fixed inset-0 z-40" style={{
          background: 'radial-gradient(ellipse at center, transparent 45%, rgba(185,28,28,0.25) 100%)',
          animation: 'pfVignette 0.5s ease-in-out infinite',
        }} />
      )}
      {flash && <div className="pointer-events-none fixed inset-0 z-40" style={{ background: 'rgba(185,28,28,0.35)' }} />}

      {fireworksOrigin && (
        <Fireworks key={fireworksKey} variant="bursts" origin={fireworksOrigin} />
      )}
      {showPageWash && (
        <div className="fixed inset-0 z-[55] pointer-events-none bg-emerald-400/15 animate-quizPageWash" />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4" role="status" aria-live="polite">
          <span className="rounded-full bg-zinc-900/95 text-zinc-100 ring-1 ring-amber-500/40 px-4 py-2 text-sm shadow-lg" style={{ animation: 'pfHintIn 0.2s ease' }}>
            {toast}
          </span>
        </div>
      )}

      <QuestionTimeline questions={questions} statusMap={statusMap} currentQid={currentQid} layout="rail" remainingMs={locked ? null : remaining} durationMs={dur} />

      {/* Stage + Panel hide behind the round-2 overlay so the retry question
          never flashes before the countdown completes. */}
      {!showRoundTwoIntro && (
      <>
      {/* Stage — light neutral surface */}
      <div className={`relative flex flex-col w-full bg-zinc-100 text-zinc-900 ${shortStage ? 'shrink-0 h-auto' : `h-[55%] ${wantsRight ? 'md:h-full md:w-[62%]' : ''}`}`}>
        {/* md+ connector: a short amber tick at the Stage's left edge continues the
            rail's amber line up into the HUD, tying the band to the vertical timeline. */}
        <span aria-hidden="true" className="hidden md:block absolute left-0 top-2 w-0.5 h-12 rounded-full bg-amber-500/50" />
        {/* HUD — three readable groups: progress · status · actions */}
        <div className="shrink-0 flex items-center gap-1 px-3 sm:px-6 py-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] text-base sm:text-lg min-h-[56px]">
          {/* Group A · progress */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col leading-none">
              <span className="text-xl sm:text-2xl font-bold text-zinc-900 tabular-nums">{resolvedCount}/{total}</span>
              <span className="text-xs text-zinc-500">gelöst</span>
            </div>
            <DifficultyBadge tier={q.tier || q.difficulty || 1} />
            {visit === 'retry' && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400/20 text-amber-600" role="img" aria-label="Wiederholung" title="Wiederholung">
                <RotateCcw className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          <span aria-hidden="true" className="w-px self-stretch bg-zinc-300 mx-2 my-1.5" />

          {/* Group B · status */}
          <div className="flex flex-1 items-center gap-1 sm:gap-2 min-w-0">
            <span className="flex items-center gap-1 font-mono font-semibold tabular-nums text-zinc-900 py-1.5 px-2"><Timer className="w-4 h-4 text-zinc-500" /> {mmss(elapsed)}</span>
            <span className="flex items-center gap-1 font-semibold tabular-nums text-emerald-600 py-1.5 px-2"><Check className="w-4 h-4 text-zinc-500" /> {correctCount}</span>
            <span className="flex items-center gap-1 font-semibold tabular-nums text-rose-600 py-1.5 px-2"><X className="w-4 h-4 text-zinc-500" /> {wrongCount}</span>
            <span className="flex items-center gap-1 font-semibold tabular-nums text-amber-600 py-1.5 px-2">✨ {fmt(score)}</span>
          </div>

          <span aria-hidden="true" className="w-px self-stretch bg-zinc-300 mx-2 my-1.5" />

          {/* Group C · actions */}
          <button type="button" onClick={doPause} aria-label="Pause" className="w-9 h-9 rounded-lg bg-zinc-200 flex items-center justify-center active:scale-95 shrink-0">
            <Pause className="w-5 h-5 text-zinc-700" />
          </button>
        </div>

        <QuestionTimeline questions={questions} statusMap={statusMap} currentQid={currentQid} layout="strip" remainingMs={locked ? null : remaining} durationMs={dur} />

        <div className="shrink-0 px-4 sm:px-6 pt-1 text-center font-display text-lg md:text-2xl lg:text-3xl text-zinc-900">
          {MODE_PROMPT[q.mode] || 'Frage'}
        </div>

        {/* Stem + radial countdown */}
        <div className={`${shortStage ? 'shrink-0' : 'flex-1 min-h-0'} px-4 sm:px-6 py-3 flex items-center justify-center overflow-hidden relative`}>
          {stemImage ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden">
              <div className={`relative ${stemLandscape ? 'w-full h-auto max-h-full' : q.stem.caption ? 'min-h-0 flex-1 w-auto max-w-full' : 'h-full w-auto'} ${stemAspectClass} rounded-2xl overflow-hidden shadow-2xl`}>
                <img
                  src={q.stem.content}
                  alt=""
                  className={`w-full h-full object-cover ${STEM_IS_PERSON.has(q.mode) ? 'object-top' : 'object-center'}`}
                  style={q.mode === 'cover_to_title' ? { filter: 'blur(18px) brightness(0.85) saturate(1.15)', transform: 'scale(1.04)' } : undefined}
                />
              </div>
              {q.stem.caption && (
                <div className="mt-2 shrink-0 text-center">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    {q.mode === 'director_to_movie' ? 'Regie' : 'Schauspiel'}
                  </div>
                  <div className="text-base sm:text-lg font-semibold text-zinc-900">
                    {q.stem.caption}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-h-full max-w-2xl overflow-auto rounded-2xl bg-white ring-1 ring-zinc-300 p-5 md:p-6 text-center">
              <p className="text-base sm:text-lg md:text-xl leading-relaxed text-zinc-900">
                {q.mode === 'plot_redacted_to_movie' ? renderRedactedPlot(q.stem.content) : q.stem.content}
              </p>
            </div>
          )}
          {!locked && (
            <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
              <RadialCountdown remaining={remaining} duration={dur} />
            </div>
          )}
        </div>

        <div className="shrink-0 h-6 text-center">
          {locked && (
            <span className="text-sm font-medium text-zinc-700" style={{ animation: 'quizTitleFade 0.4s ease' }}>{q.movie_title}</span>
          )}
        </div>
      </div>

      {/* Panel — dark surface, edge-to-edge, single hairline divider against the Stage */}
      <div className={`flex flex-col w-full bg-zinc-950 text-zinc-100 border-t border-amber-500/50 ${shortStage ? 'flex-1 min-h-0' : `h-[45%] ${wantsRight ? 'md:h-full md:w-[38%] md:border-t-0 md:border-l' : ''}`}`}>
        {!locked && q.multi_select && (
          <div role="status" aria-live="polite" className="shrink-0 px-4 sm:px-6 pt-3 flex justify-center" style={{ animation: 'pfHintIn 0.15s ease' }}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/80 text-zinc-200 px-3 py-1.5 text-xs sm:text-sm">
              <MousePointerClick className="w-4 h-4 text-amber-400 shrink-0" />
              Alle Passenden wählen, dann Bestätigen
            </span>
          </div>
        )}
        <div className={`flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-3 ${q.multi_select ? '' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}>
          <div key={visitSeq} className={`grid ${gridCols} gap-2 sm:gap-3 ${textOptions ? 'h-full auto-rows-fr' : ''} ${shortStage ? 'max-w-2xl mx-auto w-full' : ''}`} style={{ animation: 'pfSlideUp 0.25s ease' }}>
            {q.options.map((o) => (
              <OptionButton
                key={o.id}
                option={o}
                mode={q.mode}
                fill={textOptions}
                selected={selectedIds.includes(o.id)}
                locked={locked}
                reveal={reveal}
                onTap={onOption}
                hint={!q.multi_select}
                btnRef={o.id === q.correct_option_id ? correctOptionRef : undefined}
                flash={showCardFlash && o.id === q.correct_option_id}
              />
            ))}
          </div>
        </div>
        {q.multi_select && (
          <div className="shrink-0 px-4 sm:px-6 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => lockIn(selectedIds)} disabled={locked || selectedIds.length === 0}
              className="w-full rounded-xl py-3 font-semibold bg-amber-400 text-zinc-950 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
              Bestätigen ({selectedIds.length})
            </button>
          </div>
        )}
      </div>
      </>
      )}

      {showRoundTwoIntro && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Runde 2 startet"
          onClick={dismissRoundTwoIntro}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-zinc-950/85 backdrop-blur-md"
        >
          {!reduceMotion && <Fireworks variant="mini" />}
          <div className="text-amber-400 text-sm uppercase tracking-[0.3em] mb-3">
            Wiederholungs-Runde
          </div>
          <div className="text-zinc-100 font-extrabold text-6xl sm:text-7xl mb-6">
            Runde 2
          </div>
          <div className="text-zinc-300 text-base sm:text-lg max-w-md text-center px-6 mb-10">
            Falsch beantwortete Fragen kommen jetzt nochmal dran — in zufälliger
            Reihenfolge, bis alle richtig sind.
          </div>
          <div className="w-24 h-24 rounded-full ring-4 ring-amber-400 flex items-center justify-center text-amber-300 text-5xl font-bold tabular-nums animate-pulse">
            {roundTwoCountdown}
          </div>
        </div>
      )}

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
