import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Check, Volume2, Loader2, Lock } from 'lucide-react';
import { quizGetConfig, quizSaveConfig, getLibraryStatus } from '../api';
import { playMenacePreview } from '../pages/Quiz/audio';

const DIFFS = [
  { v: 'easy', label: '🟢 Leicht' },
  { v: 'medium', label: '🟡 Mittel' },
  { v: 'hard', label: '🔴 Schwer' },
  { v: 'mixed', label: '🎲 Mixed' },
];
const SIZES = [20, 50, 100];
const TIER_NAMES = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' };

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${checked ? 'bg-amber-400' : 'bg-zinc-700'}`}>
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => {
        const v = o.v ?? o;
        const label = o.label ?? o;
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`min-h-[44px] rounded-xl text-sm font-medium tabular-nums transition-colors ${value === v ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function QuizConfig() {
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState(null);
  const [saved, setSaved] = useState(false);
  const [openTier, setOpenTier] = useState({ 1: true, 2: true, 3: true });
  const saveTimer = useRef(null);

  useEffect(() => {
    quizGetConfig().then(setCfg).catch(() => {});
    getLibraryStatus().then(setStatus).catch(() => {});
  }, []);

  const patch = (p) => {
    setCfg((c) => ({ ...c, ...p }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      quizSaveConfig(p)
        .then(() => {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        })
        .catch(() => {});
    }, 400);
  };

  if (!cfg) {
    return <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Lädt…</div>;
  }

  const enabled = new Set(cfg.enabled_modes || []);
  const byTier = { 1: [], 2: [], 3: [] };
  (cfg.modes || []).forEach((m) => byTier[m.tier]?.push(m));
  const metaP = status?.meta_progress;
  const metaPct = metaP && metaP.total ? metaP.done / metaP.total : 1;
  const tier3Locked = status && !status.meta_enriched && metaPct < 0.8;

  const toggleMode = (id) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patch({ enabled_modes: [...next] });
  };
  const toggleTier = (tier, on) => {
    const next = new Set(enabled);
    byTier[tier].forEach((m) => (on ? next.add(m.id) : next.delete(m.id)));
    patch({ enabled_modes: [...next] });
  };

  const Heading = ({ children }) => (
    <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3 mt-6 first:mt-0">{children}</div>
  );

  return (
    <section className="relative max-w-2xl">
      <Heading>Standard-Einstellungen</Heading>
      <div className="space-y-4 rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 p-4">
        <div>
          <div className="text-sm font-medium text-zinc-200 mb-2">Schwierigkeit</div>
          <Segmented value={cfg.default_difficulty} options={DIFFS} onChange={(v) => patch({ default_difficulty: v })} />
        </div>
        <div>
          <div className="text-sm font-medium text-zinc-200 mb-2">Fragen pro Runde</div>
          <Segmented value={cfg.default_size} options={SIZES} onChange={(v) => patch({ default_size: v })} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-200">Countdown pro Frage</span>
            <span className="text-sm text-amber-400 tabular-nums font-mono">{cfg.countdown_seconds}s</span>
          </div>
          <input type="range" min={5} max={60} step={1} value={cfg.countdown_seconds}
            onChange={(e) => patch({ countdown_seconds: parseInt(e.target.value, 10) })}
            className="w-full accent-amber-400" />
        </div>
      </div>

      <Heading>Audio</Heading>
      <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 p-4 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-200">Sound</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={playMenacePreview}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-sm active:scale-95">
            <Volume2 className="w-4 h-4" /> Test
          </button>
          <Toggle checked={cfg.sound_enabled} onChange={(v) => patch({ sound_enabled: v })} />
        </div>
      </div>

      <Heading>Modi auswählen</Heading>
      <div className="space-y-2">
        {[1, 2, 3].map((tier) => {
          const modes = byTier[tier] || [];
          const allOn = modes.length > 0 && modes.every((m) => enabled.has(m.id));
          const locked = tier === 3 && tier3Locked;
          return (
            <div key={tier} className="rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button type="button" onClick={() => setOpenTier((o) => ({ ...o, [tier]: !o[tier] }))}
                  className="flex items-center gap-2 flex-1 text-left">
                  {openTier[tier] ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  <span className="text-sm font-semibold text-zinc-100">Tier {tier} · {TIER_NAMES[tier]}</span>
                  {locked && <Lock className="w-3.5 h-3.5 text-zinc-500" />}
                </button>
                {!locked && <Toggle checked={allOn} onChange={(v) => toggleTier(tier, v)} />}
              </div>
              {openTier[tier] && (
                <div className="px-4 pb-3 space-y-1">
                  {locked ? (
                    <p className="text-xs text-zinc-500 py-2">Verfügbar, sobald die Bibliothek angereichert ist ({Math.round(metaPct * 100)}%).</p>
                  ) : (
                    modes.map((m) => {
                      const on = enabled.has(m.id);
                      return (
                        <button key={m.id} type="button" onClick={() => toggleMode(m.id)}
                          className="w-full flex items-center gap-3 py-2 text-left active:opacity-80">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-amber-400' : 'bg-zinc-800 ring-1 ring-zinc-700'}`}>
                            {on && <Check className="w-3.5 h-3.5 text-zinc-950" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="text-sm text-zinc-200">{m.label}</span>
                            <span className="block text-xs text-zinc-500 truncate">{m.description}</span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Heading>Game Flow</Heading>
      <div className="space-y-4 rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-zinc-200">Richtige Antwort bei Fehler einblenden</span>
          <Toggle checked={cfg.show_correct_on_wrong} onChange={(v) => patch({ show_correct_on_wrong: v })} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-200">Pause zwischen Fragen</span>
            <span className="text-sm text-amber-400 tabular-nums font-mono">{(cfg.autoreveal_delay_ms / 1000).toFixed(1)}s</span>
          </div>
          <input type="range" min={500} max={3000} step={100} value={cfg.autoreveal_delay_ms}
            onChange={(e) => patch({ autoreveal_delay_ms: parseInt(e.target.value, 10) })}
            className="w-full accent-amber-400" />
        </div>
      </div>

      {saved && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold shadow-lg flex items-center gap-1.5">
          <Check className="w-4 h-4" /> gespeichert
        </div>
      )}
    </section>
  );
}
