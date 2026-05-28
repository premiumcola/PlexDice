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
  // Mobile tab: min-h-[48px] is the hard floor (touch target >= 44px after rounding),
  // with reduced vertical padding so the bar feels slim without losing tappable area.
  const base = vertical
    ? 'flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[48px] text-[11px]'
    : 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium';
  const tone = active
    ? vertical
      ? 'text-amber-400'
      : 'bg-amber-400 text-zinc-950'
    : 'text-zinc-400 active:text-zinc-200';
  return (
    <button onClick={onClick} className={`${base} ${tone} transition-colors`}>
      <Icon className={vertical ? 'w-[22px] h-[22px]' : 'w-4 h-4'} strokeWidth={2.2} />
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

  return (
    <div className="min-h-[100dvh] bg-zinc-950">
      {/* Soft scrim: solid zinc-950 behind the status bar, gently ramping just below
          the notch and then trailing off over a long distance — no hard cut-off, so
          the wordmark and the headings underneath stay fully legible. */}
      {!immersive && (
        <div
          aria-hidden="true"
          className="fixed top-0 inset-x-0 z-50 pointer-events-none"
          style={{
            height: 'calc(env(safe-area-inset-top) + 96px)',
            background:
              'linear-gradient(to bottom, '
              + 'rgb(9 9 11) 0px, '
              + 'rgb(9 9 11) env(safe-area-inset-top), '
              + 'rgba(9, 9, 11, 0.78) calc(env(safe-area-inset-top) + 6px), '
              + 'rgba(9, 9, 11, 0.12) calc(env(safe-area-inset-top) + 32px), '
              + 'rgba(9, 9, 11, 0) calc(env(safe-area-inset-top) + 96px))',
          }}
        />
      )}
      {needSettings && tab === 'settings' && (
        <div className="safe-top sticky top-0 z-50 bg-amber-400 text-zinc-950 text-sm font-semibold px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> Bitte zuerst Plex verbinden
        </div>
      )}

      <main className={immersive ? '' : 'safe-top pt-3 pb-16 sm:pb-0'}>{page}</main>

      {!immersive && (
        <>
          {/* Desktop: floating top-right nav */}
          <nav className="hidden sm:flex fixed top-4 right-4 z-40 gap-1 p-1 rounded-2xl bg-zinc-900/90 border border-zinc-800 backdrop-blur">
            {TABS.map((t) => (
              <NavItem key={t.id} active={tab === t.id} onClick={() => navigate(t.path)} icon={t.icon} label={t.label} />
            ))}
          </nav>

          {/* Mobile: bottom tab bar */}
          <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-900/95 border-t border-zinc-800 backdrop-blur pb-[max(env(safe-area-inset-bottom),12px)] flex">
            {TABS.map((t) => (
              <NavItem key={t.id} vertical active={tab === t.id} onClick={() => navigate(t.path)} icon={t.icon} label={t.label} />
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
