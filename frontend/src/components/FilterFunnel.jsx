import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const fmt = (n) => n.toLocaleString('de-DE');

const COL = {
  source: '#3f3f46', // zinc-700
  exit: '#7c3a05', // amber-900-ish
  target: '#f5a623',
  divider: '#52525b',
};

// Measure the wrapper width so the SVG is drawn in real pixel coordinates:
// crisp text, true responsive height, and never any horizontal overflow.
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// One d3-shape "sankey-link" cubic between two points of a horizontal flow.
function curve(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

// Sankey-style flow: full library bar on the left, the main amber stream narrows
// at each active-filter gate, and the rejected slice bleeds off downward into a
// dark exit terminal. Tap a gate → adjust it; tap an exit → confirm + remove it.
// Hover / long-press surfaces a tooltip with the filter's active value.
export default function FilterFunnel({ stages, total, onOpenStage, onResetStage }) {
  const [wrapRef, width] = useWidth();
  const [tip, setTip] = useState(null); // { x, stage, kind }
  const [legendOpen, setLegendOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  const hideTimer = useRef(null);
  const pressTimer = useRef(null);
  const suppressRef = useRef(false);

  if (!stages.length) return null;

  const W = width || 600;
  const n = stages.length;
  const finalCount = stages[n - 1].count_out;

  // Vertical geometry (px, scale 1).
  const HCHART = W < 420 ? 130 : W < 700 ? 168 : 188;
  const PAD_TOP = 26;
  const EXIT_DROP = 38;
  const TERM_H = 14;
  const EXIT_LABEL_H = 30;
  const yTop = PAD_TOP;
  const baseY = yTop + HCHART;
  const termTop = baseY + EXIT_DROP;
  const H = termTop + TERM_H + EXIT_LABEL_H;

  // Horizontal geometry.
  const SRC_W = 14;
  const TARGET_W = W < 420 ? 84 : 104;
  const flowStart = SRC_W;
  const flowEnd = W - TARGET_W;
  const span = Math.max(flowEnd - flowStart, 40);
  const colW = span / (n + 1);

  const h = (c) => (total > 0 ? (c / total) * HCHART : 0);
  const gateX = stages.map((_, i) => flowStart + colW * (i + 1));

  // Bottom edge of the main stream (top edge stays flat at yTop).
  const knots = [
    { x: flowStart, y: baseY },
    ...stages.map((s, i) => ({ x: gateX[i], y: yTop + h(s.count_out) })),
    { x: flowEnd, y: yTop + h(finalCount) },
  ];
  let streamD = `M ${flowStart} ${yTop} L ${flowEnd} ${yTop} L ${flowEnd} ${yTop + h(finalCount)} `;
  for (let i = knots.length - 1; i > 0; i--) {
    streamD += curve(knots[i].x, knots[i].y, knots[i - 1].x, knots[i - 1].y) + ' ';
  }
  streamD += 'Z';

  const targetH = Math.max(h(finalCount), W < 420 ? 52 : 60);

  // --- tooltip + tap/long-press interaction ---
  const showTip = (stage, i, kind) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setTip({ x: gateX[i], stage, kind });
  };
  const hideSoon = () => { hideTimer.current = setTimeout(() => setTip(null), 120); };
  const startPress = (stage, i, kind) => {
    suppressRef.current = false;
    pressTimer.current = setTimeout(() => { suppressRef.current = true; showTip(stage, i, kind); }, 600);
  };
  const endPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
    hideSoon();
  };
  const hover = (stage, i, kind) => ({
    onMouseEnter: () => showTip(stage, i, kind),
    onMouseLeave: hideSoon,
    onTouchStart: () => startPress(stage, i, kind),
    onTouchEnd: endPress,
  });
  // A long-press (which opened the tooltip) must not also fire the tap action.
  const guarded = (fn) => () => { if (!suppressRef.current) fn(); };
  const confirmReset = (s) => { if (window.confirm(`Filter ${s.label} entfernen?`)) onResetStage(s.id); };

  const tipX = tip ? Math.min(Math.max(tip.x, 72), W - 72) : 0;

  return (
    <div className="relative mb-4 rounded-2xl bg-zinc-900/60 px-2 py-2 sm:px-3 sm:py-3">
      <div ref={wrapRef} className="relative w-full">
        {width > 0 && (
          <>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="block">
              <defs>
                <linearGradient id="pf-stream" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#f5a623" stopOpacity="0.85" />
                  <stop offset="1" stopColor="#ffaf3a" stopOpacity="1" />
                </linearGradient>
                <filter id="pf-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f5a623" floodOpacity="0.55" />
                </filter>
              </defs>

              {/* Library source bar */}
              <rect x="0" y={yTop} width={SRC_W} height={HCHART} rx="3" fill={COL.source} />

              {/* Main stream */}
              <path d={streamD} fill="url(#pf-stream)" />

              {stages.map((s, i) => {
                const x0 = gateX[i];
                const yOut = yTop + h(s.count_out);
                const yIn = yTop + h(s.count_in);
                const delta = s.count_in - s.count_out;
                const xt = x0 + 6;
                const TW = Math.min(40, Math.max(16, (yIn - yOut) * 0.7));
                const tl = xt - TW / 2;
                const tr = xt + TW / 2;
                const m1 = (yOut + termTop) / 2;
                const m2 = (yIn + termTop) / 2;
                const ribbonD =
                  `M ${x0} ${yOut} ` +
                  `C ${x0} ${m1}, ${tl} ${m1}, ${tl} ${termTop} ` +
                  `L ${tr} ${termTop} ` +
                  `C ${tr} ${m2}, ${x0} ${m2}, ${x0} ${yIn} Z`;
                return (
                  <g key={s.id}>
                    <line x1={x0} y1={yTop} x2={x0} y2={baseY} stroke={COL.divider} strokeWidth="1" strokeDasharray="3 3" pointerEvents="none" />
                    {delta > 0 && (
                      <>
                        <path
                          d={ribbonD}
                          fill={COL.exit}
                          fillOpacity="0.5"
                          tabIndex={0}
                          role="button"
                          aria-label={`Filter ${s.label} entfernen, ${fmt(delta)} herausgefiltert`}
                          onClick={guarded(() => confirmReset(s))}
                          {...hover(s, i, 'exit')}
                          className="cursor-pointer outline-none transition-[filter] hover:brightness-150 focus-visible:brightness-150"
                        />
                        <rect x={tl} y={termTop} width={TW} height={TERM_H} rx="3" fill="#1c1917" stroke={COL.exit} strokeWidth="1" pointerEvents="none" />
                      </>
                    )}
                    {/* gate hit area: column above the narrowed stream */}
                    <rect
                      x={x0 - colW / 2}
                      y={0}
                      width={colW}
                      height={Math.max(yOut, yTop)}
                      fill="transparent"
                      pointerEvents="all"
                      tabIndex={0}
                      role="button"
                      aria-label={`Filter ${s.label} anpassen`}
                      onClick={guarded(() => onOpenStage(s.drawer_target))}
                      {...hover(s, i, 'gate')}
                      className="cursor-pointer outline-none"
                    />
                  </g>
                );
              })}

              {/* Treffer target bar */}
              <rect x={flowEnd} y={yTop} width={TARGET_W} height={targetH} rx="6" fill={COL.target} filter="url(#pf-glow)" />
            </svg>

            {/* HTML overlay: crisp text + lucide icons (Safari-safe, no foreignObject) */}
            <div className="absolute inset-0 pointer-events-none text-white">
              <div className="absolute text-[10px] text-zinc-400 tabular-nums whitespace-nowrap" style={{ left: SRC_W + 4, top: 4 }}>
                {fmt(total)} · Bibliothek
              </div>

              {stages.map((s, i) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={guarded(() => onOpenStage(s.drawer_target))}
                    {...hover(s, i, 'gate')}
                    className="absolute -translate-x-1/2 pointer-events-auto flex items-center gap-1 text-xs text-zinc-300 tabular-nums whitespace-nowrap transition-colors hover:text-amber-300"
                    style={{ left: gateX[i], top: 4 }}
                  >
                    <Icon className="w-3.5 h-3.5 text-amber-400/90" />
                    <span className="hidden md:inline">{fmt(s.count_out)}</span>
                  </button>
                );
              })}

              {stages.map((s, i) => {
                const Icon = s.icon;
                const delta = s.count_in - s.count_out;
                if (delta <= 0) return null;
                const hideSmall = n > 4 && i < 2 ? 'max-[499px]:hidden' : '';
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={guarded(() => confirmReset(s))}
                    {...hover(s, i, 'exit')}
                    className={`absolute -translate-x-1/2 pointer-events-auto flex items-center gap-1 text-[11px] text-zinc-400 whitespace-nowrap transition-colors hover:text-amber-300 ${hideSmall}`}
                    style={{ left: gateX[i] + 6, top: termTop + TERM_H + 3 }}
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="tabular-nums">−{fmt(delta)}</span>
                    <span> · {s.label}</span>
                  </button>
                );
              })}

              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-white"
                style={{ left: flowEnd + TARGET_W / 2, top: yTop + targetH / 2 }}
              >
                <span className="font-display-tight text-3xl lg:text-4xl leading-none tabular-nums" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>{fmt(finalCount)}</span>
                <span className="text-xs font-semibold uppercase tracking-widest mt-0.5">Treffer</span>
              </div>

              {/* Tooltip */}
              {tip && (
                <div
                  className="absolute z-20 -translate-x-1/2 -translate-y-full pointer-events-none"
                  style={{ left: tipX, top: yTop - 10 }}
                >
                  <div className="relative max-w-[240px] rounded-xl bg-zinc-900/95 backdrop-blur-md ring-1 ring-zinc-800 shadow-xl p-3">
                    <div className="text-xs font-semibold text-zinc-100">
                      {tip.stage.label} · <span className="text-amber-400">{tip.stage.summary}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 tabular-nums whitespace-nowrap mt-0.5">
                      {fmt(tip.stage.count_in)} → {fmt(tip.stage.count_out)} Filme
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-1 whitespace-nowrap">
                      {tip.kind === 'exit' ? 'Tippen zum Entfernen' : 'Tippen zum Anpassen'}
                    </div>
                    <div
                      className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0"
                      style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid rgba(24,24,27,0.95)' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Legend (toggleable; open on desktop, collapsed on tablet) */}
      <div className="mt-1.5 px-1">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {legendOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Legende
        </button>
        {legendOpen && (
          <div className="mt-1.5 space-y-1 text-[11px] text-zinc-400">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(90deg,#f5a623,#ffaf3a)' }} />
                Hauptstrom (Treffer)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COL.exit, opacity: 0.5 }} />
                Herausgefiltert
              </span>
            </div>
            <p className="text-zinc-500">
              Tipp: Tippe einen Filter um ihn anzupassen, eine Ausstromfahne um ihn zu entfernen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
