import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, Check, X, Pause, Play, RotateCcw, LogOut, MousePointerClick } from 'lucide-react';
import { navigate } from '../../router';
import { quizAnswer, quizAbandon } from '../../api';
import { loadRound, saveResults, clearRound } from './store';
import { MODE_PROMPT, TIER_LABEL, STEM_IS_PERSON, OPTIONS_ARE_PERSONS, panelOnRight, fmt } from './util';

const TIER_DOT = { 1: '#34d399', 2: '#f5a623', 3: '#fb7185' }; // emerald / amber / rose

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
import { initAudio, tick, tickParams, chime, buzz } from './audio';
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

// Two-layer "blur curtain": a blurred, slightly-scaled copy of the poster fills the
// frame while a sharp copy on top is masked away at one edge, letting the blur show
// through there. Hides on-art text (title at top / release year at bottom) as
// atmospheric haze rather than a hard white block. Parent must be `relative`.
function MaskedPoster({ src, direction }) {
  const gradient =
    direction === 'bottom'
      ? 'linear-gradient(to top, transparent 0%, transparent 18%, black 28%, black 100%)'
      : 'linear-gradient(to bottom, transparent 0%, transparent 18%, black 28%, black 100%)';
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover object-center"
        style={{ filter: 'blur(14px) brightness(0.85)', transform: 'scale(1.06)' }}
      />
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        style={{ WebkitMaskImage: gradient, maskImage: gradient }}
      />
    </>
  );
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
function OptionButton({ option, mode, fill, selected, locked, reveal, onTap }) {
  let cls = 'border border-zinc-700 bg-zinc-800/60 text-zinc-100';
  let anim;
  if (!locked && selected) {
    cls = 'border-2 border-amber-400 bg-amber-400/12 text-amber-300';
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
  // Headshots are square/4:5 — a 2:3 cell bottom-crops chins. Posters stay 2:3.
  const imageBox = OPTIONS_ARE_PERSONS.has(mode) ? 'aspect-square w-full' : 'aspect-[2/3] w-full';
  // Text options: in a text-only grid they stretch to fill the cell (big, centered);
  // otherwise (a rare text fallback among images) they stay compact and left-aligned.
  const textBox = fill
    ? 'h-full p-4 md:p-6 flex flex-col items-center justify-center text-center'
    : 'min-h-[64px] p-3 md:p-4 flex flex-col justify-center text-left';
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onTap(option.id)}
      style={{ animation: anim || 'none' }}
      className={`relative rounded-2xl overflow-hidden ${cls} transition-all active:scale-[0.97] disabled:active:scale-100 ${isImage ? imageBox : textBox}`}
    >
      {isImage ? (
        <>
          {option.content ? (
            <img src={option.content} alt="" className={`absolute inset-0 w-full h-full object-cover ${OPTIONS_ARE_PERSONS.has(mode) ? 'object-top' : 'object-center'}`} />
          ) : (
            <div className="absolute inset-0 bg-zinc-800" />
          )}
          {selected && !locked && <div className="absolute inset-0 ring-2 ring-amber-400 rounded-2xl pointer-events-none" />}
          {OPTIONS_ARE_PERSONS.has(mode) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/90 to-transparent px-2 py-1.5">
              <div className="text-xs sm:text-sm font-medium text-white truncate">{option.label}</div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className={`font-semibold leading-tight ${fill ? 'text-lg md:text-2xl tabular-nums' : 'text-base sm:text-lg'}`}>{option.content}</div>
          {option.label && <div className="text-xs text-zinc-400 tabular-nums mt-0.5">{option.label}</div>}
        </>
      )}
    </button>
  );
}

export default function QuizPlay({ roundId }) {
  const round = useRef(loadRound(roundId)).current;
  const questions = round?.questions || [];
  const dur = (round?.countdown_seconds || 15) * 1000;
  const soundOn = round?.sound_enabled !== false;
  const autoreveal = round?.autoreveal_delay_ms || 1200;
  const showCorrect = round?.show_correct_on_wrong !== false;

  const [index, setIndex] = useState(0);
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

  const startRef = useRef(Date.now());
  const roundStartRef = useRef(Date.now());
  const pausedRef = useRef(false);
  const pauseRemainRef = useRef(dur);
  const lastTickRef = useRef(0);
  const answersRef = useRef([]);
  const selectedRef = useRef([]);
  const lastTapRef = useRef({ id: null, ts: 0 });
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
      setScore((s) => s + pts);
      if (correct) setCorrectCount((c) => c + 1);
      else setWrongCount((c) => c + 1);
      answersRef.current.push({ mode: q.mode, correct, points: pts, difficulty: q.difficulty });
      if (soundOn) (correct ? chime : buzz)();
      if (timedOut) {
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
      }
      quizAnswer(roundId, payload).catch(() => {});
      advanceRef.current = setTimeout(() => {
        if (index + 1 >= questions.length) finish();
        else {
          setIndex((i) => i + 1);
          setLocked(false);
          setReveal(null);
          setSelectedIds([]);
          selectedRef.current = [];
        }
      }, autoreveal);
    },
    [locked, q, roundId, index, questions.length, finish, dur, soundOn, showCorrect, autoreveal],
  );

  const onOption = (id) => {
    if (locked || pausedRef.current) return;
    initAudio();
    if (q.multi_select) {
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
    lastTapRef.current = { id, ts: now };
    selectedRef.current = [id];
    setSelectedIds([id]);
  };

  useEffect(() => {
    if (locked || !q) return undefined;
    startRef.current = Date.now();
    lastTickRef.current = 0;
    setRemaining(dur);
    const iv = setInterval(() => {
      if (pausedRef.current) return;
      const rem = dur - (Date.now() - startRef.current);
      if (rem <= 0) {
        setRemaining(0);
        lockIn(selectedRef.current, true);
        return;
      }
      setRemaining(rem);
      if (soundOn) {
        const { hz, freq } = tickParams(rem / dur);
        if (Date.now() - lastTickRef.current >= 1000 / hz) {
          lastTickRef.current = Date.now();
          tick(freq);
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [index, locked, q, lockIn, dur, soundOn]);

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

  const stemImage = q.stem.kind === 'image';
  // Which poster edge to blur away (hides on-art title/year); null renders it sharp.
  const stemMaskDir =
    q.mode === 'cover_to_title' ? 'top' : q.mode === 'movie_to_year_exact' ? 'bottom' : null;
  // md+ only: tall image options claim the full-height stage on the right so covers
  // never clip; text-chip trays / multi-select sit below. Below md it is always
  // bottom (CSS handles the breakpoint).
  const wantsRight = panelOnRight(q);
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
    <div className={`h-[100dvh] flex flex-col overflow-hidden relative ${wantsRight ? 'md:flex-row' : ''}`}>
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

      {/* Stage — light neutral surface */}
      <div className={`relative flex flex-col h-[55%] w-full bg-zinc-100 text-zinc-900 ${wantsRight ? 'md:h-full md:w-[62%]' : ''}`}>
        {/* HUD */}
        <div className="shrink-0 flex items-center gap-2 px-3 sm:px-6 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm">
          <span className="flex items-center gap-1.5 min-h-[44px]">
            <span className="tabular-nums text-zinc-900 font-medium">{index + 1}/{questions.length}</span>
            <span className="text-zinc-400">·</span>
            <DifficultyBadge tier={q.tier || q.difficulty || 1} />
          </span>
          <span className="flex items-center gap-1 font-mono tabular-nums text-zinc-900 ml-auto"><Timer className="w-4 h-4 text-zinc-500" /> {mmss(elapsed)}</span>
          <span className="flex items-center gap-1 tabular-nums text-emerald-600"><Check className="w-4 h-4" /> {correctCount}</span>
          <span className="flex items-center gap-1 tabular-nums text-rose-600"><X className="w-4 h-4" /> {wrongCount}</span>
          <span className="flex items-center gap-1 font-semibold tabular-nums text-amber-600">✨ {fmt(score)}</span>
          <button type="button" onClick={doPause} aria-label="Pause" className="w-9 h-9 rounded-lg bg-zinc-200 flex items-center justify-center active:scale-95 shrink-0">
            <Pause className="w-4 h-4 text-zinc-700" />
          </button>
        </div>

        <div className="shrink-0 px-4 sm:px-6 pt-1 text-center font-display text-lg md:text-2xl lg:text-3xl text-zinc-900">
          {MODE_PROMPT[q.mode] || 'Frage'}
        </div>

        {/* Stem + radial countdown */}
        <div className="flex-1 min-h-0 px-4 sm:px-6 py-3 flex items-center justify-center overflow-hidden relative">
          {stemImage ? (
            <div className={`relative ${STEM_IS_PERSON.has(q.mode) ? 'aspect-square' : 'aspect-[2/3]'} max-h-full max-w-[min(70vw,360px)] landscape:max-h-[60vh] rounded-2xl overflow-hidden shadow-2xl`}>
              {stemMaskDir ? (
                <MaskedPoster src={q.stem.content} direction={stemMaskDir} />
              ) : (
                <img
                  src={q.stem.content}
                  alt=""
                  className={`w-full h-full object-cover ${STEM_IS_PERSON.has(q.mode) ? 'object-top' : 'object-center'}`}
                />
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
            <div className="absolute top-1 right-1 sm:top-3 sm:right-3 scale-75 sm:scale-90 xl:scale-100 origin-top-right">
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
      <div className={`flex flex-col h-[45%] w-full bg-zinc-950 text-zinc-100 border-t border-amber-500/50 ${wantsRight ? 'md:h-full md:w-[38%] md:border-t-0 md:border-l' : ''}`}>
        {!locked && (q.multi_select || selectedIds.length > 0) && (
          <div role="status" aria-live="polite" className="shrink-0 px-4 sm:px-6 pt-3 flex justify-center" style={{ animation: 'pfHintIn 0.15s ease' }}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/80 text-zinc-200 px-3 py-1.5 text-xs sm:text-sm">
              <MousePointerClick className="w-4 h-4 text-amber-400 shrink-0" />
              {q.multi_select ? 'Alle Passenden wählen, dann Bestätigen' : 'Nochmal tippen zum Bestätigen'}
            </span>
          </div>
        )}
        <div className={`flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-3 ${q.multi_select ? '' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}>
          <div key={index} className={`grid ${gridCols} gap-2 sm:gap-3 ${textOptions ? 'h-full auto-rows-fr' : ''}`} style={{ animation: 'pfSlideUp 0.25s ease' }}>
            {q.options.map((o) => (
              <OptionButton key={o.id} option={o} mode={q.mode} fill={textOptions} selected={selectedIds.includes(o.id)} locked={locked} reveal={reveal} onTap={onOption} />
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
