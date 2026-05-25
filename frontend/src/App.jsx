import { useState, useEffect, useCallback } from 'react';
import { Dices, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import Dice from './pages/Dice';
import Settings from './pages/Settings';
import { getSettings } from './api';

function hashRoute() {
  return window.location.hash.replace('#', '') === 'settings' ? 'settings' : 'dice';
}

function NavItem({ active, onClick, icon: Icon, label, vertical }) {
  const base = vertical
    ? 'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px]'
    : 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium';
  const tone = active
    ? vertical ? 'text-amber-400' : 'bg-amber-400 text-zinc-950'
    : 'text-zinc-400 active:text-zinc-200';
  return (
    <button onClick={onClick} className={`${base} ${tone} transition-colors`}>
      <Icon className={vertical ? 'w-5 h-5' : 'w-4 h-4'} strokeWidth={2.2} />
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  const [route, setRoute] = useState(hashRoute);
  const [needSettings, setNeedSettings] = useState(false);

  const navigate = useCallback((r) => {
    setRoute(r);
    window.location.hash = r;
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(hashRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // On first load, send the user to Settings if Plex isn't connected yet.
  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        if (!(s?.plex?.tokenSet && s?.plex?.url)) {
          setNeedSettings(true);
          navigate('settings');
        }
      } catch {
        setNeedSettings(true);
      }
    })();
  }, [navigate]);

  const handleNeedSettings = useCallback(() => {
    setNeedSettings(true);
    navigate('settings');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-zinc-950">
      {needSettings && route === 'settings' && (
        <div className="safe-top sticky top-0 z-50 bg-amber-400 text-zinc-950 text-sm font-semibold px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> Bitte zuerst Plex verbinden
        </div>
      )}

      <main className="pb-16 sm:pb-0">
        {route === 'settings'
          ? <Settings onConnected={() => setNeedSettings(false)} />
          : <Dice onNeedSettings={handleNeedSettings} />}
      </main>

      {/* Desktop: floating top-right nav */}
      <nav className="hidden sm:flex fixed top-4 right-4 z-40 gap-1 p-1 rounded-2xl bg-zinc-900/90 border border-zinc-800 backdrop-blur">
        <NavItem active={route === 'dice'} onClick={() => navigate('dice')} icon={Dices} label="Würfeln" />
        <NavItem active={route === 'settings'} onClick={() => navigate('settings')} icon={SettingsIcon} label="Einstellungen" />
      </nav>

      {/* Mobile: bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-900/95 border-t border-zinc-800 backdrop-blur safe-bottom flex">
        <NavItem vertical active={route === 'dice'} onClick={() => navigate('dice')} icon={Dices} label="Würfeln" />
        <NavItem vertical active={route === 'settings'} onClick={() => navigate('settings')} icon={SettingsIcon} label="Einstellungen" />
      </nav>
    </div>
  );
}
