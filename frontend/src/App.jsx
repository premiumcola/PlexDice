import { useState, useEffect, useCallback } from 'react';
import { Dices, Target, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import Dice from './pages/Dice';
import Settings from './pages/Settings';
import QuizRouter from './pages/Quiz';
import { getSettings } from './api';
import { usePathname, navigate } from './router';

const TABS = [
  { id: 'dice', label: 'Würfeln', icon: Dices, path: '/' },
  { id: 'quiz', label: 'Quiz', icon: Target, path: '/quiz' },
  { id: 'settings', label: 'Einstellungen', icon: SettingsIcon, path: '/settings' },
];

function activeTab(pathname) {
  if (pathname.startsWith('/quiz')) return 'quiz';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dice';
}

function NavItem({ active, onClick, icon: Icon, label, vertical }) {
  // Mobile tab: icon over label, pinned to the BOTTOM of the bar (justify-end) so they sit just
  // above the home-indicator inset (the nav's padding-bottom). min-h-[54px] keeps the touch
  // target above the 44px floor.
  const base = vertical
    ? 'flex-1 flex flex-col items-center justify-end gap-1 pt-2 pb-1 min-h-[54px] text-[11px]'
    : 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium';
  const tone = active
    ? vertical
      ? 'text-[#f5a623]' // PlexDice accent on the active mobile tab
      : 'bg-amber-400 text-zinc-950'
    : 'text-zinc-400 active:text-zinc-200';
  return (
    <button onClick={onClick} className={`${base} ${tone} transition-colors`}>
      <Icon className={vertical ? 'w-7 h-7' : 'w-4 h-4'} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  const pathname = usePathname();
  const [needSettings, setNeedSettings] = useState(false);
  const tab = activeTab(pathname);
  const immersive = pathname.startsWith('/quiz/play'); // full-screen quiz play

  // On first load: to Settings if Plex isn't connected; otherwise honour the
  // start-tab preference when landing on the root.
  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        if (!(s?.plex?.tokenSet && s?.plex?.url)) {
          setNeedSettings(true);
          if (!window.location.pathname.startsWith('/settings')) navigate('/settings');
          return;
        }
        if (window.location.pathname === '/') {
          const start = s?.ui?.start_tab || 'last';
          let dest = null;
          if (start === 'quiz') dest = '/quiz';
          else if (start === 'last') {
            let last = null;
            try { last = localStorage.getItem('plexdice:lastTab'); } catch { /* storage unavailable */ }
            if (last === 'quiz') dest = '/quiz';
          }
          if (dest) navigate(dest, { replace: true });
        }
      } catch {
        setNeedSettings(true);
      }
    })();
  }, []);

  // Remember the last content tab so "Zuletzt genutzt" can restore it next launch.
  useEffect(() => {
    if (tab === 'dice' || tab === 'quiz') {
      try { localStorage.setItem('plexdice:lastTab', tab); } catch { /* storage unavailable */ }
    }
  }, [tab]);

  const handleNeedSettings = useCallback(() => {
    setNeedSettings(true);
    navigate('/settings');
  }, []);

  let page;
  if (tab === 'settings') page = <Settings onConnected={() => setNeedSettings(false)} />;
  else if (tab === 'quiz') page = <QuizRouter pathname={pathname} />;
  else page = <Dice onNeedSettings={handleNeedSettings} />;

  const showBanner = needSettings && tab === 'settings';

  return (
    // App shell: a flex column filling #root (the JS-height-driven flex container in index.css,
    // height = var(--app-height) = window.innerHeight + top safe-area inset = the full screen).
    // <main> is the only scroll area; the mobile bottom nav is the LAST flex child, sitting
    // flush at the true screen bottom — its own background + padding-bottom
    // env(safe-area-inset-bottom) bleed into the rounded corners. No vh/dvh, no fixed shell.
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-zinc-950" style={{ background: 'rgba(0,255,0,0.55)', outline: '2px solid #000' }}>
      {/* TEMP DEBUG (Task P): bottom-region tints — REMOVE AFTER DIAGNOSIS */}
      <span style={{ position: 'fixed', top: 26, left: 0, zIndex: 99999, background: 'rgba(255,255,255,0.92)', color: '#000', font: 'bold 10px/13px monospace', padding: '0 3px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>SHELL</span>
      {/* Status-bar scrim — the STRONG top dark gradient: fully opaque black at the very top
          edge (0%) → an even linear fade to fully transparent exactly at the blue mark, the
          bottom of the Dynamic Island (height = safe-area-inset-top). Nothing renders below
          that mark. Own layer (translateZ) so it never jumps on iOS scroll. */}
      {!immersive && (
        <div
          aria-hidden="true"
          className="fixed top-0 inset-x-0 z-50 pointer-events-none"
          style={{
            height: 'env(safe-area-inset-top)',
            transform: 'translateZ(0)',
            background:
              'linear-gradient(to bottom, '
              + 'rgba(0, 0, 0, 1) 0%, '
              + 'rgba(0, 0, 0, 0) 100%)',
          }}
        />
      )}
      {showBanner && (
        <div className="safe-top shrink-0 z-50 bg-amber-400 text-zinc-950 text-sm font-semibold px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> Bitte zuerst Plex verbinden
        </div>
      )}

      <main className={`flex-1 min-h-0 overflow-y-auto ${immersive || showBanner ? '' : 'safe-top'}`} style={{ background: 'rgba(170,0,255,0.55)', outline: '2px solid #fff' }}><span style={{ position: 'fixed', top: 39, left: 0, zIndex: 99999, background: 'rgba(255,255,255,0.92)', color: '#000', font: 'bold 10px/13px monospace', padding: '0 3px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>MAIN</span>{page}</main>

      {!immersive && (
        <>
          {/* Desktop (lg+): a VERTICAL nav stacked in the very top-right corner — no hairline
              border (depth via the translucent surface + shadow). Only at lg+, where the
              centered content column leaves a clear right gutter, so it never overlaps the
              header or the J1 mini-filters (which live right-aligned inside the column). */}
          <nav className="hidden lg:flex lg:flex-col fixed top-4 right-4 z-40 gap-1 p-1 rounded-2xl bg-zinc-900/90 backdrop-blur shadow-lg shadow-black/40">
            {TABS.map((t) => (
              <NavItem key={t.id} active={tab === t.id} onClick={() => navigate(t.path)} icon={t.icon} label={t.label} />
            ))}
          </nav>

          {/* Mobile: bottom tab bar — the LAST flex child of the #root flex column
              (flex:0 0 auto via shrink-0; NORMAL flow, NOT fixed/absolute, no bottom offset).
              #root's height is the JS-corrected full screen (window.innerHeight + top inset),
              so the bar's bottom IS the physical screen bottom. The zinc-900 background sits on
              the nav itself and fills THROUGH padding-bottom: env(safe-area-inset-bottom) — no
              inner wrapper — so it bleeds into the home-indicator + rounded corners, no gap.
              FLAT: separation comes from the zinc-900↔zinc-950 colour step alone — NO drop-shadow
              scrim above the bar (the old upward shadow read as a stray dark band over content). */}
          <nav className="lg:hidden shrink-0 z-40 bg-zinc-900 pb-[env(safe-area-inset-bottom)] flex" style={{ background: 'rgba(0,255,255,0.55)', outline: '2px solid #000', position: 'relative' }}>
            <span style={{ position: 'absolute', top: 0, left: 0, zIndex: 99999, background: 'rgba(255,255,255,0.92)', color: '#000', font: 'bold 10px/13px monospace', padding: '0 3px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>NAV</span>
            <div className="flex flex-1" style={{ background: 'rgba(255,0,255,0.55)', outline: '2px solid #fff', position: 'relative' }}>
              <span style={{ position: 'absolute', top: 0, left: 70, zIndex: 99999, background: 'rgba(255,255,255,0.92)', color: '#000', font: 'bold 10px/13px monospace', padding: '0 3px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>NAV-INNER</span>
              {TABS.map((t) => (
                <NavItem key={t.id} vertical active={tab === t.id} onClick={() => navigate(t.path)} icon={t.icon} label={t.label} />
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
