import { Fragment } from 'react';
import { X, ChevronRight, ChevronDown } from 'lucide-react';

const ACCENT = '#f5a623';
const fmt = (n) => n.toLocaleString('de-DE');

// Cascading funnel: one orange segment per ACTIVE filter, narrowing the library
// from the full count to the final hit count. Tap a segment to jump into the
// drawer; tap its ✕ to clear only that dimension.
export default function FilterFunnel({ stages, total, onOpenStage, onResetStage }) {
  if (!stages.length) return null;
  const finalCount = stages[stages.length - 1].count_out;
  const n = stages.length;

  return (
    <div className="mb-4 p-3 sm:p-4 rounded-2xl bg-zinc-900/60">
      <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-0">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const delta = s.count_in - s.count_out;
          const opacity = n > 1 ? 1 - (i / (n - 1)) * 0.55 : 1;
          const grow = total > 0 ? Math.max(s.count_out / total, 0.16) : 1;
          return (
            <Fragment key={s.id}>
              <div className="flex flex-col md:min-w-0" style={{ flexGrow: grow, flexBasis: 0 }}>
                <div className="text-[11px] text-zinc-400 mb-1 px-1 truncate">
                  {delta > 0 ? `−${fmt(delta)} herausgefiltert` : 'nichts gefiltert'}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenStage(s.drawer_target)}
                  className="relative flex-1 w-full text-left rounded-xl p-3 min-h-[78px] active:scale-[0.98] transition-transform"
                  style={{ background: `rgba(245, 166, 35, ${opacity})` }}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`${s.label}-Filter entfernen`}
                    onClick={(e) => { e.stopPropagation(); onResetStage(s.id); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/25 flex items-center justify-center active:bg-black/45"
                  >
                    <X className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                  </span>
                  <div
                    className="flex items-center gap-2.5 text-white"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
                  >
                    <Icon className="w-5 h-5 shrink-0" strokeWidth={2.4} />
                    <div className="min-w-0 pr-5">
                      <div className="text-2xl font-extrabold leading-none">{fmt(s.count_out)}</div>
                      <div className="text-xs font-semibold mt-1 truncate">{s.label}</div>
                      <div className="text-[11px] font-medium opacity-90 truncate">{s.summary}</div>
                    </div>
                  </div>
                </button>
              </div>
              <div className="flex items-center justify-center text-zinc-600 md:px-1">
                <ChevronDown className="w-4 h-4 md:hidden" />
                <ChevronRight className="w-4 h-4 hidden md:block" />
              </div>
            </Fragment>
          );
        })}
        <div className="flex flex-col md:min-w-[88px]">
          <div className="text-[11px] mb-1 px-1 select-none hidden md:block">&nbsp;</div>
          <div
            className="flex-1 rounded-xl px-4 py-3 min-h-[78px] flex flex-col items-center justify-center"
            style={{ background: ACCENT, boxShadow: '0 8px 24px rgba(245,166,35,0.30)' }}
          >
            <div
              className="text-2xl font-extrabold leading-none text-white"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
            >
              {fmt(finalCount)}
            </div>
            <div
              className="text-xs font-bold text-white mt-1"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
            >
              Treffer
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
