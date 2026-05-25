import { useState, useMemo, useEffect } from 'react';
import {
  Dices, SlidersHorizontal, ChevronDown, ChevronUp, Clock, Calendar, Star,
  ShieldAlert, Tag, Film, X, AlertCircle, History as HistoryIcon, Youtube,
  ExternalLink, Tv2, Sparkles, Play, Loader2, Eye, EyeOff, Check, Shield,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { getLibrary, aiPlot, getSettings, saveSettings } from '../api';
import { HistogramRange } from '../components/HistogramRange';
import FilterFunnel from '../components/FilterFunnel';

const ACCENT = '#f5a623';
const RUNTIME_MIN_BOUND = 60;
const RUNTIME_MAX_BOUND = 240;
const PREFS_KEY = 'plexdice:prefs:v1';
const FSK_VALUES = [0, 6, 12, 16, 18];

function fskColor(f) {
  if (f === 0) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (f === 6) return 'bg-lime-500/15 text-lime-300 border-lime-500/30';
  if (f === 12) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (f === 16) return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  if (f === 18) return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
}

function formatRuntime(m) {
  if (!m) return '?';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min.toString().padStart(2, '0')}m`;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function Fireworks() {
  const particles = useMemo(() => {
    const colors = ['#f5a623', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#34d399', '#fde047'];
    const out = [];
    const bursts = [
      { x: 50, y: 35 },
      { x: 25, y: 55 },
      { x: 75, y: 50 },
    ];
    bursts.forEach((burst, bi) => {
      const count = 22;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const distance = 80 + Math.random() * 140;
        out.push({
          id: `${bi}-${i}`,
          x: burst.x,
          y: burst.y,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2 + Math.random() * 4,
          delay: bi * 0.15 + Math.random() * 0.1,
          duration: 0.9 + Math.random() * 0.5,
        });
      }
    });
    return out;
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.size / 10}
            fill={p.color}
            style={{
              animation: `firework ${p.duration}s ease-out ${p.delay}s forwards`,
              transformOrigin: `${p.x}px ${p.y}px`,
              '--dx': `${p.dx / 10}px`,
              '--dy': `${p.dy / 10}px`,
            }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full">
          {['✨', '⭐', '✨'].map((emoji, i) => (
            <div
              key={i}
              className="absolute text-4xl"
              style={{
                left: `${20 + i * 30}%`,
                top: `${30 + (i % 2) * 15}%`,
                animation: `starPop 0.8s ease-out ${i * 0.1}s both`,
              }}
            >
              {emoji}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dice({ onNeedSettings }) {
  const [movies, setMovies] = useState([]);
  const [moviesReady, setMoviesReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [showFilters, setShowFilters] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [yearMin, setYearMin] = useState(null);
  const [yearMax, setYearMax] = useState(null);
  const [runtimeMin, setRuntimeMin] = useState(RUNTIME_MIN_BOUND);
  const [runtimeMax, setRuntimeMax] = useState(RUNTIME_MAX_BOUND);
  const [fskMin, setFskMin] = useState(0);
  const [fskMax, setFskMax] = useState(16);
  const [ratingMin, setRatingMin] = useState(6.0);
  const [ratingMax, setRatingMax] = useState(10.0);
  const [watched, setWatched] = useState('all'); // 'all' | 'unseen' | 'seen'
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [picked, setPicked] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [ticker, setTicker] = useState(null);
  const [fireworks, setFireworks] = useState(false);
  const [fireworksKey, setFireworksKey] = useState(0);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [highlightSection, setHighlightSection] = useState(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [aiInfo, setAiInfo] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Library bounds derived from the fetched movies.
  const yearBounds = useMemo(() => {
    const years = movies.map((m) => m.y).filter(Boolean);
    return {
      min: years.length ? Math.min(...years) : 1950,
      max: years.length ? Math.max(...years) : new Date().getFullYear(),
    };
  }, [movies]);

  const allGenres = useMemo(
    () => [...new Set(movies.flatMap((m) => m.g || []))].sort(),
    [movies],
  );

  // Load saved preferences (once), then fetch the library.
  useEffect(() => {
    const p = loadPrefs();
    if (p) {
      if (Array.isArray(p.selectedGenres)) setSelectedGenres(p.selectedGenres);
      if (typeof p.yearMin === 'number') setYearMin(p.yearMin);
      if (typeof p.yearMax === 'number') setYearMax(p.yearMax);
      if (typeof p.runtimeMin === 'number') setRuntimeMin(p.runtimeMin);
      if (typeof p.runtimeMax === 'number') setRuntimeMax(p.runtimeMax);
      if (typeof p.fskMin === 'number') setFskMin(p.fskMin);
      if (typeof p.fskMax === 'number') setFskMax(p.fskMax);
      if (typeof p.ratingMin === 'number') setRatingMin(p.ratingMin);
      if (typeof p.ratingMax === 'number') setRatingMax(p.ratingMax);
    }
    setPrefsLoaded(true);

    (async () => {
      try {
        const { movies: list } = await getLibrary();
        setMovies(list);
        if (list.length === 0) onNeedSettings?.();
      } catch (e) {
        setLoadError(e.message || 'Bibliothek konnte nicht geladen werden');
      } finally {
        setMoviesReady(true);
      }
    })();
  }, [onNeedSettings]);

  // Once movies + prefs are ready, snap any unset year range to the library bounds.
  useEffect(() => {
    if (!moviesReady || !prefsLoaded) return;
    setYearMin((prev) => (prev == null ? yearBounds.min : Math.max(yearBounds.min, prev)));
    setYearMax((prev) => (prev == null ? yearBounds.max : Math.min(yearBounds.max, prev)));
  }, [moviesReady, prefsLoaded, yearBounds.min, yearBounds.max]);

  // Persist preferences whenever they change (after initial load).
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          selectedGenres, yearMin, yearMax, runtimeMin, runtimeMax,
          fskMin, fskMax, ratingMin, ratingMax,
        }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [prefsLoaded, selectedGenres, yearMin, yearMax, runtimeMin, runtimeMax, fskMin, fskMax, ratingMin, ratingMax]);

  // Load the persisted watched-status choice from server settings (ui.last_filters).
  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        const w = s?.ui?.last_filters?.watched;
        if (w === 'all' || w === 'unseen' || w === 'seen') setWatched(w);
      } catch {
        /* settings unavailable — keep default */
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  // Persist the watched-status choice back to server settings once loaded.
  useEffect(() => {
    if (!settingsLoaded) return;
    saveSettings({ ui: { last_filters: { watched } } }).catch(() => {});
  }, [settingsLoaded, watched]);

  const effYearMin = yearMin ?? yearBounds.min;
  const effYearMax = yearMax ?? yearBounds.max;

  // One pipeline of ACTIVE filters, shared by the funnel (per-stage counts) and the
  // final list — so the funnel's last count always equals filtered.length, and an
  // empty pipeline means the full, unfiltered library.
  const activeStages = useMemo(() => {
    const fmtRating = (v) => v.toFixed(1).replace('.', ',');
    const runtimeSummary =
      runtimeMin === RUNTIME_MIN_BOUND ? `≤ ${formatRuntime(runtimeMax)}`
        : runtimeMax === RUNTIME_MAX_BOUND ? `≥ ${formatRuntime(runtimeMin)}`
          : `${formatRuntime(runtimeMin)}–${formatRuntime(runtimeMax)}`;
    const ratingSummary =
      ratingMax >= 10 ? `Ab ${fmtRating(ratingMin)}`
        : ratingMin <= 0 ? `Bis ${fmtRating(ratingMax)}`
          : `${fmtRating(ratingMin)}–${fmtRating(ratingMax)}`;
    return [
      selectedGenres.length > 0 && {
        id: 'genre', label: 'Genres', icon: Tag, drawer_target: 'genre',
        summary: selectedGenres.join(', '),
        pred: (m) => selectedGenres.every((g) => (m.g || []).includes(g)),
      },
      (effYearMin !== yearBounds.min || effYearMax !== yearBounds.max) && {
        id: 'year', label: 'Jahr', icon: Calendar, drawer_target: 'year',
        summary: `${effYearMin}–${effYearMax}`,
        pred: (m) => !m.y || (m.y >= effYearMin && m.y <= effYearMax),
      },
      (runtimeMin !== RUNTIME_MIN_BOUND || runtimeMax !== RUNTIME_MAX_BOUND) && {
        id: 'runtime', label: 'Spielzeit', icon: Clock, drawer_target: 'runtime',
        summary: runtimeSummary,
        pred: (m) => !m.r || (m.r >= runtimeMin && m.r <= runtimeMax),
      },
      (fskMin > 0 || fskMax < 18) && {
        id: 'fsk', label: 'FSK', icon: Shield, drawer_target: 'fsk',
        summary: fskMin > 0 ? `FSK ${fskMin}–${fskMax}` : `FSK ≤ ${fskMax}`,
        pred: (m) => m.f == null || (m.f >= fskMin && m.f <= fskMax),
      },
      (ratingMin > 0 || ratingMax < 10) && {
        id: 'rating', label: 'Bewertung', icon: Star, drawer_target: 'rating',
        summary: ratingSummary,
        pred: (m) => m.s == null || (m.s >= ratingMin && m.s <= ratingMax),
      },
      watched !== 'all' && {
        id: 'watched', label: 'Gesehen', icon: Eye, drawer_target: 'watched',
        summary: watched === 'unseen' ? 'Ungesehen' : 'Gesehen',
        pred: (m) => (watched === 'unseen' ? (m.view_count || 0) === 0 : (m.view_count || 0) > 0),
      },
    ].filter(Boolean);
  }, [selectedGenres, effYearMin, effYearMax, yearBounds.min, yearBounds.max, runtimeMin, runtimeMax, fskMin, fskMax, ratingMin, ratingMax, watched]);

  const filtered = useMemo(() => {
    let pool = movies;
    for (const stage of activeStages) pool = pool.filter(stage.pred);
    return pool;
  }, [movies, activeStages]);

  // Step-by-step counts driving the funnel visualization.
  const funnelStages = useMemo(() => {
    let pool = movies;
    return activeStages.map(({ pred, ...meta }) => {
      const count_in = pool.length;
      pool = pool.filter(pred);
      return { ...meta, count_in, count_out: pool.length };
    });
  }, [movies, activeStages]);

  const pick = () => {
    if (filtered.length === 0) return;
    setRolling(true);
    setShowFilters(false);
    setShowHistory(false);
    setAiInfo(null);

    const choice = filtered[Math.floor(Math.random() * filtered.length)];

    const tickInterval = setInterval(() => {
      setTicker(filtered[Math.floor(Math.random() * filtered.length)]);
    }, 90);

    setTimeout(() => {
      clearInterval(tickInterval);
      setTicker(null);
      setPicked(choice);
      setHistory((h) => [choice, ...h.filter((x) => x.key !== choice.key)].slice(0, 12));
      setRolling(false);
      setFireworksKey((k) => k + 1);
      setFireworks(true);
      setTimeout(() => setFireworks(false), 1800);
    }, 2400);
  };

  const fetchAi = async () => {
    if (!picked) return;
    setAiLoading(true);
    try {
      setAiInfo(await aiPlot(picked));
    } catch (e) {
      setAiInfo({ error: e.message || 'Fehler' });
    } finally {
      setAiLoading(false);
    }
  };

  const toggleGenre = (g) => {
    setSelectedGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const resetFilters = () => {
    setSelectedGenres([]);
    setYearMin(yearBounds.min);
    setYearMax(yearBounds.max);
    setRuntimeMin(RUNTIME_MIN_BOUND);
    setRuntimeMax(RUNTIME_MAX_BOUND);
    setFskMin(0);
    setFskMax(16);
    setRatingMin(6.0);
    setRatingMax(10.0);
    setWatched('all');
  };

  const activeFilterCount = activeStages.length;

  // Open the drawer scrolled to a stage's section, with a brief highlight pulse.
  const openStage = (target) => {
    setShowHistory(false);
    setShowFilters(true);
    setHighlightSection(target);
    setTimeout(() => {
      document.getElementById(`filter-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    setTimeout(() => setHighlightSection(null), 1300);
  };

  // Clear a single filter dimension to its neutral (inactive) value.
  const resetStage = (id) => {
    if (id === 'genre') setSelectedGenres([]);
    else if (id === 'year') { setYearMin(yearBounds.min); setYearMax(yearBounds.max); }
    else if (id === 'runtime') { setRuntimeMin(RUNTIME_MIN_BOUND); setRuntimeMax(RUNTIME_MAX_BOUND); }
    else if (id === 'fsk') { setFskMin(0); setFskMax(18); }
    else if (id === 'rating') { setRatingMin(0); setRatingMax(10); }
    else if (id === 'watched') setWatched('all');
  };

  const sectionClass = (id) => (highlightSection === id ? 'filter-pulse' : undefined);

  const selectPicked = (m) => {
    setPicked(m);
    setAiInfo(null);
    setShowHistory(false);
  };

  return (
    <>
      <style>{`
        @keyframes danceBg {
          0% { background-position: 0% 50%; opacity: 0.55; }
          25% { background-position: 50% 100%; opacity: 0.85; }
          50% { background-position: 100% 50%; opacity: 0.7; }
          75% { background-position: 50% 0%; opacity: 0.95; }
          100% { background-position: 0% 50%; opacity: 0.55; }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 24px 2px rgba(245,166,35,0.45), 0 0 60px 6px rgba(245,166,35,0.18); }
          50% { box-shadow: 0 0 36px 6px rgba(245,166,35,0.75), 0 0 100px 18px rgba(244,114,182,0.35), 0 0 140px 30px rgba(124,58,237,0.18); }
        }
        @keyframes diceShake {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-18deg) translateY(-1px); }
          40% { transform: rotate(14deg) translateY(1px); }
          60% { transform: rotate(-12deg); }
          80% { transform: rotate(18deg); }
        }
        @keyframes firework {
          0% { transform: translate(0, 0) scale(0); opacity: 1; }
          15% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
        @keyframes starPop {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          30% { transform: scale(1.6) rotate(180deg); opacity: 1; }
          60% { transform: scale(1.1) rotate(280deg); opacity: 0.9; }
          100% { transform: scale(2.4) rotate(360deg); opacity: 0; }
        }
        @keyframes revealCard {
          0% { transform: scale(0.92); opacity: 0; filter: blur(8px); }
          60% { transform: scale(1.02); opacity: 1; filter: blur(0); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }
        .reveal-card { animation: revealCard 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes filterPulse {
          0% { box-shadow: 0 0 0 0 rgba(245,166,35,0); }
          25% { box-shadow: 0 0 0 3px rgba(245,166,35,0.55); }
          100% { box-shadow: 0 0 0 0 rgba(245,166,35,0); }
        }
        .filter-pulse { border-radius: 12px; animation: filterPulse 1.2s ease-out; }
        .rolling-bg {
          background: linear-gradient(125deg,
            rgba(245,166,35,0.22) 0%, rgba(244,114,182,0.18) 25%,
            rgba(124,58,237,0.16) 50%, rgba(34,211,238,0.14) 75%, rgba(245,166,35,0.22) 100%);
          background-size: 400% 400%;
          animation: danceBg 2.4s ease-in-out infinite;
          filter: blur(2px);
        }
        .glow-pulse { animation: glowPulse 0.9s ease-in-out infinite; }
        .dice-shake { display: inline-block; animation: diceShake 0.4s ease-in-out infinite; }
        .dual-range-input {
          position: absolute; top: 0; left: 10px; right: 10px;
          width: calc(100% - 20px); height: 36px; background: transparent;
          -webkit-appearance: none; appearance: none; pointer-events: none; outline: none; margin: 0;
        }
        .dual-range-input::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; pointer-events: auto;
          width: 22px; height: 22px; border-radius: 50%; background: ${ACCENT};
          border: 3px solid #18181b; box-shadow: 0 2px 8px rgba(0,0,0,0.5); cursor: pointer;
        }
        .dual-range-input::-moz-range-thumb {
          pointer-events: auto; width: 22px; height: 22px; border-radius: 50%; background: ${ACCENT};
          border: 3px solid #18181b; box-shadow: 0 2px 8px rgba(0,0,0,0.5); cursor: pointer;
        }
        .dual-range-input::-webkit-slider-runnable-track { background: transparent; height: 36px; }
        .dual-range-input::-moz-range-track { background: transparent; height: 36px; }
      `}</style>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(245, 166, 35, 0.08), transparent 70%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(124, 58, 237, 0.06), transparent 70%)',
        }} />

        {rolling && <div className="fixed inset-0 pointer-events-none rolling-bg" />}
        {fireworks && <Fireworks key={fireworksKey} />}

        <div className="relative max-w-2xl mx-auto px-4 pt-6 pb-24 sm:py-10">
          <header className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-400/20">
                <Dices className="w-5 h-5 text-zinc-950" strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-3xl lg:text-4xl tracking-tight leading-none">PlexDice</h1>
                <p className="text-sm tabular-nums opsz-14">
                  <span className={activeFilterCount > 0 ? 'text-amber-400 font-bold' : 'text-zinc-200 font-medium'}>{filtered.length.toLocaleString('de-DE')}</span>
                  <span className="text-zinc-400"> von {movies.length.toLocaleString('de-DE')} Filmen{activeFilterCount > 0 ? ' (gefiltert)' : ''}</span>
                </p>
              </div>
            </div>
          </header>

          {/* Empty / error states */}
          {moviesReady && movies.length === 0 && (
            <button
              onClick={() => onNeedSettings?.()}
              className="w-full mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-100">
                  {loadError
                    ? `Bibliothek konnte nicht geladen werden: ${loadError}`
                    : 'Noch keine Filme. Tippe hier, um Plex zu verbinden und die Bibliothek zu synchronisieren.'}
                </div>
              </div>
            </button>
          )}

          {/* Filter toggle bar */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setShowFilters((s) => !s)}
              className="flex-1 flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 active:scale-[0.98] transition-transform"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
                <span className="font-medium">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-zinc-950 text-xs font-bold">{activeFilterCount}</span>
                )}
              </span>
              {showFilters ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
            </button>
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory((s) => !s)}
                className="px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 active:scale-[0.98] transition-transform"
                aria-label="Verlauf"
              >
                <HistoryIcon className="w-4 h-4 text-zinc-400" />
              </button>
            )}
          </div>

          {/* Headline funnel: how active filters narrow the pool (placeholder when none) */}
          {movies.length > 0 && (
            funnelStages.length > 0 ? (
              <FilterFunnel
                stages={funnelStages}
                total={movies.length}
                onOpenStage={openStage}
                onResetStage={resetStage}
              />
            ) : (
              <p className="mb-4 text-center text-sm text-zinc-500">
                {movies.length.toLocaleString('de-DE')} Filme · keine Filter aktiv
              </p>
            )
          )}

          {/* Filter panel */}
          {showFilters && (
            <div className="mb-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-5">
              <div id="filter-genre" className={sectionClass('genre')}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2 uppercase tracking-wide">
                    <Tag className="w-3.5 h-3.5" /> Genres
                  </label>
                  {selectedGenres.length > 0 && (
                    <button onClick={() => setSelectedGenres([])} className="text-xs text-amber-400/80 active:text-amber-300 font-medium">leeren</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {allGenres.map((g) => {
                    const on = selectedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        onClick={() => toggleGenre(g)}
                        className={`px-3 py-1.5 rounded-xl text-sm border transition-colors active:scale-95 ${on ? 'bg-amber-400 text-zinc-950 border-amber-400 font-medium' : 'bg-zinc-900 text-zinc-300 border-zinc-800'}`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
                {selectedGenres.length > 0 && (
                  <p className="text-xs text-zinc-400 mt-2">Treffer wenn alle gewählten Genres passen</p>
                )}
              </div>

              <div id="filter-watched" className={sectionClass('watched')}>
                <label className="text-sm font-medium text-zinc-200 flex items-center gap-2 mb-2 uppercase tracking-wide">
                  <Eye className="w-3.5 h-3.5" /> Gesehen
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'all', label: 'Alle', Icon: Eye },
                    { v: 'unseen', label: 'Ungesehen', Icon: EyeOff },
                    { v: 'seen', label: 'Gesehen', Icon: Check },
                  ].map(({ v, label, Icon }) => {
                    const on = watched === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setWatched(v)}
                        className={`min-h-[44px] px-2 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.97] transition-colors ${on ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}
                      >
                        <Icon className="w-4 h-4 shrink-0" /> <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div id="filter-year" className={sectionClass('year')}>
                <label className="text-sm font-medium text-zinc-200 flex items-center gap-2 mb-2 uppercase tracking-wide">
                  <Calendar className="w-3.5 h-3.5" /> Jahr: <span className="text-amber-400 font-mono normal-case">{effYearMin}</span> – <span className="text-amber-400 font-mono normal-case">{effYearMax}</span>
                </label>
                <HistogramRange
                  data={movies.map((m) => m.y).filter(Boolean)}
                  min={yearBounds.min} max={yearBounds.max}
                  valueMin={effYearMin} valueMax={effYearMax}
                  onChangeMin={setYearMin} onChangeMax={setYearMax}
                  bucketCount={31} step={1}
                />
              </div>

              <div id="filter-runtime" className={sectionClass('runtime')}>
                <label className="text-sm font-medium text-zinc-200 flex items-center gap-2 mb-2 uppercase tracking-wide">
                  <Clock className="w-3.5 h-3.5" /> Spielzeit: <span className="text-amber-400 font-mono normal-case">{formatRuntime(runtimeMin)}</span> – <span className="text-amber-400 font-mono normal-case">{formatRuntime(runtimeMax)}</span>
                </label>
                <HistogramRange
                  data={movies.map((m) => m.r).filter(Boolean)}
                  min={RUNTIME_MIN_BOUND} max={RUNTIME_MAX_BOUND}
                  valueMin={runtimeMin} valueMax={runtimeMax}
                  onChangeMin={setRuntimeMin} onChangeMax={setRuntimeMax}
                  bucketCount={24} step={5} formatValue={formatRuntime}
                />
              </div>

              <div id="filter-fsk" className={sectionClass('fsk')}>
                <label className="text-sm font-medium text-zinc-200 flex items-center gap-2 mb-2 uppercase tracking-wide">
                  <ShieldAlert className="w-3.5 h-3.5" /> FSK: <span className="text-amber-400 font-mono">{fskMin}</span> – <span className="text-amber-400 font-mono">{fskMax}</span>
                </label>
                {(() => {
                  const counts = FSK_VALUES.map((f) => movies.filter((m) => m.f === f).length);
                  const maxC = Math.max(1, ...counts);
                  const minIdx = FSK_VALUES.indexOf(fskMin);
                  const maxIdx = FSK_VALUES.indexOf(fskMax);
                  return (
                    <div>
                      <div className="flex items-end gap-1.5 h-14 mb-2 px-[10px]">
                        {FSK_VALUES.map((f, i) => {
                          const active = f >= fskMin && f <= fskMax;
                          const h = (counts[i] / maxC) * 100;
                          return (
                            <div key={f} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                              <div className="w-full rounded-t-md transition-colors" style={{ height: `${Math.max(8, h)}%`, background: active ? ACCENT : 'rgba(82,82,91,0.5)' }} />
                            </div>
                          );
                        })}
                      </div>
                      <div className="dual-range relative h-9 px-[10px] mb-2">
                        <div className="absolute top-1/2 left-[10px] right-[10px] h-1 -translate-y-1/2 rounded-full bg-zinc-700/60" />
                        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-amber-400" style={{ left: `calc(10px + ${(minIdx / (FSK_VALUES.length - 1)) * 100}%)`, right: `calc(10px + ${100 - (maxIdx / (FSK_VALUES.length - 1)) * 100}%)` }} />
                        <input type="range" min={0} max={FSK_VALUES.length - 1} step={1} value={minIdx}
                          onChange={(e) => { const v = parseInt(e.target.value, 10); setFskMin(FSK_VALUES[Math.min(v, maxIdx)]); }}
                          className="dual-range-input" style={{ zIndex: 2 }} />
                        <input type="range" min={0} max={FSK_VALUES.length - 1} step={1} value={maxIdx}
                          onChange={(e) => { const v = parseInt(e.target.value, 10); setFskMax(FSK_VALUES[Math.max(v, minIdx)]); }}
                          className="dual-range-input" style={{ zIndex: 3 }} />
                      </div>
                      <div className="flex gap-1.5 px-1">
                        {FSK_VALUES.map((f, i) => (
                          <div key={f} className="flex-1 text-center">
                            <div className={`text-xs font-bold ${f >= fskMin && f <= fskMax ? 'text-amber-400' : 'text-zinc-500'}`}>{f}</div>
                            <div className="text-[9px] text-zinc-500">{counts[i]}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div id="filter-rating" className={sectionClass('rating')}>
                <label className="text-sm font-medium text-zinc-200 flex items-center gap-2 mb-2 uppercase tracking-wide">
                  <Star className="w-3.5 h-3.5" /> Bewertung: <span className="text-amber-400 font-mono">{ratingMin.toFixed(1)}</span> – <span className="text-amber-400 font-mono">{ratingMax.toFixed(1)}</span>
                </label>
                <HistogramRange
                  data={movies.map((m) => m.s).filter((s) => s != null)}
                  min={0} max={10}
                  valueMin={ratingMin} valueMax={ratingMax}
                  onChangeMin={setRatingMin} onChangeMax={setRatingMax}
                  bucketCount={20} step={0.1} formatValue={(v) => v.toFixed(1)}
                />
              </div>

              <button onClick={resetFilters}
                className="w-full py-2 rounded-xl bg-zinc-800/60 text-zinc-300 text-sm font-medium border border-zinc-800 active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
                <X className="w-3.5 h-3.5" /> Filter zurücksetzen
              </button>
            </div>
          )}

          {/* History panel */}
          {showHistory && history.length > 0 && (
            <div className="mb-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-300">Letzte Würfe</h3>
                <button onClick={() => setHistory([])} className="text-xs text-amber-400/80 active:text-amber-300 font-medium">leeren</button>
              </div>
              <div className="space-y-1.5">
                {history.map((m, i) => (
                  <button key={m.key ?? i} onClick={() => selectPicked(m)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60 active:scale-[0.98] transition-transform">
                    <div className="text-sm font-medium text-zinc-200 truncate">{m.t}</div>
                    <div className="text-xs text-zinc-400">{m.y} · {(m.g || []).slice(0, 2).join(', ')}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Roll button */}
          <button
            onClick={pick}
            disabled={filtered.length === 0 || rolling}
            className={`w-full py-5 rounded-2xl bg-amber-400 text-zinc-950 font-semibold text-lg tracking-wide flex items-center justify-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100 ${rolling ? 'glow-pulse' : 'shadow-xl shadow-amber-400/30'}`}
          >
            <span className={rolling ? 'dice-shake' : 'inline-block'}>
              <Dices className="w-6 h-6" strokeWidth={2.5} />
            </span>
            {rolling ? 'Würfle…' : picked ? 'Nochmal würfeln' : 'Film würfeln'}
          </button>

          {filtered.length === 0 && movies.length > 0 && (
            <div className="mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-sm text-rose-200">Keine Filme entsprechen deinen Filtern. Reduziere ein paar Kriterien.</div>
            </div>
          )}

          {/* Rolling ticker card */}
          {rolling && ticker && (
            <article className="mt-6 rounded-3xl bg-gradient-to-br from-amber-500/15 to-zinc-900/40 border border-amber-400/30 overflow-hidden">
              <div className="p-6 sm:p-8 text-center">
                <span className="text-xs uppercase tracking-widest text-amber-400 font-medium block mb-3">Würfle…</span>
                <h2 className="font-display-tight text-2xl sm:text-3xl leading-tight tracking-tight text-zinc-300 truncate">
                  {ticker.t}
                </h2>
                <p className="text-sm text-zinc-500 mt-2">{ticker.y} · {(ticker.g || []).slice(0, 2).join(', ')}</p>
              </div>
            </article>
          )}

          {/* Picked movie card */}
          {picked && !rolling && (
            <article key={picked.key} className="mt-6 rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-900/40 border border-zinc-800 overflow-hidden reveal-card">
              <div className="p-5 sm:p-7">
                <div className="flex gap-4">
                  {picked.thumb_url && (
                    <img
                      src={picked.thumb_url}
                      alt=""
                      loading="lazy"
                      className="w-[140px] sm:w-[180px] aspect-[2/3] rounded-xl object-cover bg-zinc-800 shrink-0"
                      style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 32px rgba(245, 166, 35, 0.15)' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <span className="text-xs uppercase tracking-widest text-amber-400/80 font-medium">Dein Film für heute</span>
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    </div>
                    <h2 className="font-display-tight text-3xl sm:text-4xl lg:text-5xl leading-tight tracking-tight mt-1">
                      {picked.t}
                    </h2>
                    {picked.o && picked.o !== picked.t && (
                      <p className="text-sm text-zinc-400 mt-1 italic">{picked.o}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3 tabular-nums">
                      {picked.y && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 text-zinc-300 text-sm">
                          <Calendar className="w-3.5 h-3.5" /> {picked.y}
                        </span>
                      )}
                      {picked.r && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 text-zinc-300 text-sm">
                          <Clock className="w-3.5 h-3.5" /> {formatRuntime(picked.r)}
                        </span>
                      )}
                      {picked.s != null && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 text-sm font-medium">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {picked.s.toFixed(1).replace('.', ',')}
                        </span>
                      )}
                      {picked.f != null && (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-medium ${fskColor(picked.f)}`}>
                          FSK {picked.f}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Genres */}
                {(picked.g || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {picked.g.map((g) => (
                      <span key={g} className="px-2 py-0.5 rounded-md bg-zinc-800/40 text-zinc-400 text-xs">{g}</span>
                    ))}
                  </div>
                )}

                {/* Plex summary */}
                {picked.summary && (
                  <p className="text-base text-zinc-300 leading-relaxed mt-4 line-clamp-5 opsz-20">{picked.summary}</p>
                )}

                {/* AI enrichment */}
                <div className="mt-5">
                  {!aiInfo && !aiLoading && (
                    <button onClick={fetchAi}
                      className="w-full py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                      <Sparkles className="w-4 h-4" /> Lohnt sich der Film?
                    </button>
                  )}
                  {aiLoading && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> KI denkt nach…
                    </div>
                  )}
                  {aiInfo && aiInfo.disabled && (
                    <p className="text-xs text-zinc-500">KI-Anreicherung ist nicht konfiguriert.</p>
                  )}
                  {aiInfo && aiInfo.error && (
                    <p className="text-xs text-rose-300">KI-Fehler: {aiInfo.error}</p>
                  )}
                  {aiInfo && !aiInfo.disabled && !aiInfo.error && (
                    <div className="space-y-3">
                      {!picked.summary && aiInfo.plot && (
                        <p className="text-base text-zinc-300 leading-relaxed opsz-20">{aiInfo.plot}</p>
                      )}
                      {aiInfo.hot_take && (
                        <div className="rounded-2xl bg-zinc-900 p-4 space-y-3">
                          <h3 className="font-display text-xl text-white leading-snug">
                            {aiInfo.hot_take}
                          </h3>
                          {(aiInfo.pros || []).length > 0 && (
                            <div className="space-y-1.5">
                              {aiInfo.pros.map((p, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm text-zinc-200">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                  <span>{p}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {aiInfo.caveat && (
                            <div className="flex items-start gap-2 text-sm text-zinc-200">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              <span>{aiInfo.caveat}</span>
                            </div>
                          )}
                          {aiInfo.fit && (
                            <p className="text-sm italic text-zinc-400 pt-1">
                              Passt zu dir, wenn {aiInfo.fit.replace(/^passt zu dir,?\s*wenn\s+/i, '')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* External + Plex links */}
                <div className="mt-6 pt-5 border-t border-zinc-800/60 space-y-2">
                  {picked.plex_url && (
                    <a
                      href={picked.plex_url}
                      target="_blank" rel="noopener noreferrer"
                      className="w-full py-3 rounded-xl bg-amber-400 text-zinc-950 font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-amber-400/20"
                    >
                      <Play className="w-4 h-4 fill-zinc-950" /> In Plex abspielen
                    </a>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        const q = encodeURIComponent((picked.o || picked.t) + ' ' + (picked.y || '') + ' trailer');
                        const appUrl = `youtube://results?search_query=${q}`;
                        const webUrl = `https://www.youtube.com/results?search_query=${q}+deutsch`;
                        const fallbackTimer = setTimeout(() => { window.open(webUrl, '_blank', 'noopener'); }, 800);
                        const cancel = () => { if (document.hidden) clearTimeout(fallbackTimer); };
                        document.addEventListener('visibilitychange', cancel, { once: true });
                        window.location.href = appUrl;
                      }}
                      className="py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                      <Youtube className="w-4 h-4" /> Trailer
                    </button>
                    <a
                      href={`https://www.imdb.com/find/?q=${encodeURIComponent(picked.o || picked.t)}&s=tt&ttype=ft`}
                      target="_blank" rel="noopener noreferrer"
                      className="py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                      <ExternalLink className="w-4 h-4" /> IMDb
                    </a>
                    <a
                      href={`https://thetvdb.com/search?query=${encodeURIComponent(picked.o && picked.o !== picked.t ? picked.o : picked.t)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                      <Tv2 className="w-4 h-4" /> TheTVDB
                    </a>
                  </div>
                </div>
              </div>
            </article>
          )}

          {!picked && !rolling && movies.length > 0 && (
            <div className="mt-8 text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 mb-4">
                <Dices className="w-9 h-9 text-zinc-700" strokeWidth={1.5} />
              </div>
              <p className="text-zinc-300 text-sm">Drück den Button und lass dich überraschen</p>
            </div>
          )}

          <footer className="mt-12 pt-6 border-t border-zinc-900 text-center">
            <p className="text-xs text-zinc-500 flex items-center justify-center gap-1.5">
              <Film className="w-3 h-3" /> PlexDice · {movies.length.toLocaleString('de-DE')} Filme
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
