import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Server, RefreshCw, Loader2, Check, AlertCircle, Save, Library,
  Settings as SettingsIcon, Info, Database, Plug, LogOut,
} from 'lucide-react';
import {
  getSettings, saveSettings, discoverServers, testConnection, refreshLibrary,
  createPlexPin, checkPlexPin, plexLogout, getPlexConnectionInfo,
} from '../api';
import QuizConfig from '../components/QuizConfig';

const TABS = [
  { id: 'allgemein', label: 'Allgemein' },
  { id: 'plex', label: 'Plex' },
  { id: 'bibliotheken', label: 'Bibliotheken' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'ueber', label: 'Über' },
];

const DEFAULT_PORT = '32400';
const POLL_INTERVAL = 2000;
const LOGIN_TIMEOUT = 5 * 60 * 1000;

function parseUrl(url) {
  if (!url) return { hostname: '', port: DEFAULT_PORT, ssl: true };
  try {
    const u = new URL(url);
    return {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? '443' : DEFAULT_PORT),
      ssl: u.protocol === 'https:',
    };
  } catch {
    return { hostname: url, port: DEFAULT_PORT, ssl: true };
  }
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-amber-400' : 'bg-zinc-700'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3">
      <div className="sm:w-56 shrink-0">
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        {hint && <div className="text-xs text-zinc-500 mt-0.5">{hint}</div>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function Settings({ onConnected }) {
  const [activeTab, setActiveTab] = useState('plex');
  const [loaded, setLoaded] = useState(false);

  const [clientId, setClientId] = useState('');
  const [user, setUser] = useState(null);

  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState(DEFAULT_PORT);
  const [ssl, setSsl] = useState(true);
  const [manualUrl, setManualUrl] = useState('');
  const [connInfo, setConnInfo] = useState(null);

  const [servers, setServers] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState('');

  const [sections, setSections] = useState([]);
  const [selectedLibraries, setSelectedLibraries] = useState([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState('');

  const [polling, setPolling] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [toast, setToast] = useState(null);

  const pollRef = useRef(null);
  const timeoutRef = useRef(null);
  const popupRef = useRef(null);

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshConnInfo = useCallback(async () => {
    try {
      setConnInfo(await getPlexConnectionInfo());
    } catch {
      setConnInfo(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        const plex = s.plex || {};
        const parsed = parseUrl(plex.url);
        setClientId(plex.client_id || '');
        setUser(plex.user || null);
        setHostname(parsed.hostname);
        setPort(parsed.port);
        setSsl(plex.ssl != null ? plex.ssl : parsed.ssl);
        setSelectedLibraries(plex.libraries || []);
        setManualUrl(plex.plex_server_url || '');
        refreshConnInfo();
      } catch {
        /* first run */
      } finally {
        setLoaded(true);
      }
    })();
  }, [refreshConnInfo]);

  const composeUrl = useCallback(
    () => `${ssl ? 'https' : 'http'}://${hostname.trim()}:${(port || DEFAULT_PORT).toString().trim()}`,
    [ssl, hostname, port],
  );

  const doDiscover = useCallback(async () => {
    setDiscovering(true);
    setDiscoverError('');
    try {
      const { servers: list } = await discoverServers();
      setServers(list || []);
      if (!list || list.length === 0) setDiscoverError('Keine Server gefunden');
      else if (!hostname) {
        // Auto-select the first server so the Bibliotheken tab works right after login.
        const server = list[0];
        const conn = server.connections.find((c) => c.https) || server.connections[0];
        if (conn) {
          try { setHostname(new URL(conn.uri).hostname); } catch { setHostname(conn.address); }
          setPort(String(conn.port));
          setSsl(Boolean(conn.https));
        }
      }
    } catch (e) {
      setDiscoverError(e.message || 'Serversuche fehlgeschlagen');
    } finally {
      setDiscovering(false);
    }
  }, [hostname]);

  const onSelectServer = (name) => {
    const server = servers.find((s) => s.name === name);
    if (!server || !server.connections.length) return;
    const conn = server.connections.find((c) => c.https) || server.connections[0];
    try { setHostname(new URL(conn.uri).hostname); } catch { setHostname(conn.address); }
    setPort(String(conn.port));
    setSsl(Boolean(conn.https));
  };

  const doTest = useCallback(async () => {
    setTesting(true);
    setTestError('');
    setTestResult(null);
    try {
      const res = await testConnection({ url: composeUrl(), ssl });
      setTestResult(res);
      setSections(res.library_sections || []);
    } catch (e) {
      setTestError(e.message || 'Verbindung fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  }, [composeUrl, ssl]);

  const buildPatch = () => ({
    plex: { url: composeUrl(), ssl, libraries: selectedLibraries, plex_server_url: manualUrl.trim() },
  });

  const doSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveSettings(buildPatch());
      setSaved(true);
      onConnected?.();
      refreshConnInfo();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setTestError(e.message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const toggleLibrary = (id) => {
    setSelectedLibraries((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const doSync = async () => {
    setSyncing(true);
    setSyncError('');
    setSyncResult(null);
    try {
      await saveSettings(buildPatch());
      const res = await refreshLibrary();
      setSyncResult(res);
      onConnected?.();
    } catch (e) {
      setSyncError(e.message || 'Synchronisierung fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  // ---- OAuth PIN login ----
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setPolling(false);
  }, []);

  const handleLoginSuccess = useCallback((u) => {
    stopPolling();
    try { popupRef.current?.close(); } catch { /* cross-origin */ }
    setUser(u);
    showToast('success', '✓ Mit Plex verbunden');
    setActiveTab('bibliotheken');
    onConnected?.();
  }, [stopPolling, showToast, onConnected]);

  const startLogin = async () => {
    setLoginError('');

    // Open the popup synchronously inside the click handler. Browsers (Safari
    // most strictly) only let window.open bypass the popup blocker when it runs
    // synchronously in a user gesture; any await before it drops that trust and
    // the call silently returns null. So we open about:blank now and navigate it
    // to the real Plex URL once the async PIN request returns.
    const popup = window.open('about:blank', 'plexlogin', 'width=560,height=720');
    if (!popup) {
      showToast('error', 'Popup blockiert. Bitte Popups für diese Seite erlauben und nochmal versuchen.');
      return;
    }
    popupRef.current = popup;
    try {
      popup.document.write(
        '<!doctype html><meta charset="utf-8"><title>Plex</title>'
        + '<body style="margin:0;display:flex;align-items:center;justify-content:center;'
        + 'height:100vh;background:#09090b;color:#a1a1aa;font:16px system-ui,sans-serif">'
        + 'Verbinde mit Plex …</body>',
      );
    } catch { /* popup already navigated cross-origin */ }

    let pin;
    try {
      pin = await createPlexPin();
    } catch (e) {
      try { popup.close(); } catch { /* ignore */ }
      showToast('error', 'Login fehlgeschlagen');
      setLoginError(e.message || 'error');
      return;
    }
    const params = [
      `clientID=${encodeURIComponent(clientId)}`,
      `code=${encodeURIComponent(pin.code)}`,
      `context[device][product]=${encodeURIComponent('PlexDice')}`,
    ].join('&');
    popup.location.href = `https://app.plex.tv/auth#?${params}`;
    setPolling(true);

    pollRef.current = setInterval(async () => {
      try {
        const res = await checkPlexPin(pin.id);
        if (res.ok) handleLoginSuccess(res.user);
      } catch {
        /* transient network error — keep polling */
      }
    }, POLL_INTERVAL);

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      showToast('error', 'Zeitüberschreitung – bitte erneut versuchen');
      setLoginError('timeout');
    }, LOGIN_TIMEOUT);
  };

  const cancelLogin = () => {
    stopPolling();
    try { popupRef.current?.close(); } catch { /* cross-origin */ }
  };

  const doLogout = async () => {
    try { await plexLogout(); } catch { /* ignore */ }
    setUser(null);
    setServers([]);
    setSections([]);
    setTestResult(null);
    showToast('success', 'Abgemeldet');
  };

  // Auto-discover servers once logged in (State 2 "on mount").
  useEffect(() => {
    if (user && servers.length === 0 && !discovering) doDiscover();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load movie sections when the Bibliotheken tab is shown and a host is known.
  useEffect(() => {
    if (activeTab === 'bibliotheken' && user && hostname && sections.length === 0 && !testing) doTest();
  }, [activeTab, hostname, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up timers on unmount.
  useEffect(() => () => stopPolling(), [stopPolling]);

  const serverFields = (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 px-4 divide-y divide-zinc-800/60">
      <Row label="Server">
        <div className="flex gap-2">
          <select
            onChange={(e) => onSelectServer(e.target.value)}
            value=""
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 outline-none focus:ring-2 focus:ring-amber-400/60"
          >
            <option value="" disabled>{servers.length ? 'Server wählen' : 'Server werden geladen…'}</option>
            {servers.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={doDiscover}
            disabled={discovering}
            className="px-3 py-2 rounded-xl bg-amber-400 text-zinc-950 font-medium flex items-center gap-1.5 disabled:opacity-40 active:scale-[0.97] transition-transform"
            title="Verfügbare Server neu laden"
          >
            {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        {discoverError && <p className="text-xs text-rose-300 mt-1.5">{discoverError}</p>}
      </Row>

      <Row label="Hostname oder IP-Adresse">
        <div className="flex rounded-xl bg-zinc-950 overflow-hidden focus-within:ring-2 focus-within:ring-amber-400/60">
          <span className="px-3 py-2 bg-zinc-800 text-zinc-400 text-sm select-none">{ssl ? 'https://' : 'http://'}</span>
          <input
            type="text"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="192.168.1.10"
            className="flex-1 min-w-0 px-3 py-2 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none"
          />
        </div>
      </Row>

      <Row label="Port">
        <input
          type="text"
          inputMode="numeric"
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder={DEFAULT_PORT}
          className="w-32 px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-400/60"
        />
      </Row>

      <Row label="SSL verwenden">
        <Toggle checked={ssl} onChange={setSsl} />
      </Row>

      <Row label="Server-URL (manuell)">
        <input
          type="url"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="https://192.168.178.10:32400"
          className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-400/60"
        />
        <p className="text-xs text-zinc-500 mt-1.5">
          Lass leer für automatische Plex-Erkennung. Manuell setzen wenn plex.direct DNS nicht funktioniert.
        </p>
        {connInfo?.url && (
          <div className="text-xs font-mono text-zinc-500 mt-1.5 truncate">
            Aktiv: <span className={connInfo.reachable ? 'text-emerald-400' : 'text-rose-300'}>{connInfo.url}</span>
            <span className="text-zinc-600"> · {connInfo.mode === 'manual' ? 'manuell' : 'automatisch'}</span>
          </div>
        )}
      </Row>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg flex items-center gap-2 text-white ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 sm:pb-12">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-400/20">
            <SettingsIcon className="w-5 h-5 text-zinc-950" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl lg:text-4xl tracking-tight">Einstellungen</h1>
        </div>

        <div className="flex gap-1 overflow-x-auto mb-6 p-1 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-xl text-base font-medium whitespace-nowrap transition-colors ${activeTab === t.id ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 active:text-zinc-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!loaded && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Lädt…</div>
        )}

        {loaded && activeTab === 'plex' && (
          <section>
            <h2 className="text-lg font-semibold mb-1">Plex Einstellungen</h2>
            <p className="text-sm text-zinc-400 mb-4">Melde dich mit deinem Plex-Account an und wähle deinen Server.</p>

            {!user ? (
              <div className="py-8 flex flex-col items-center text-center">
                {!polling ? (
                  <button
                    onClick={startLogin}
                    className="h-12 px-8 rounded-xl bg-amber-400 text-white font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-amber-400/20"
                  >
                    <Plug className="w-5 h-5" /> Mit Plex anmelden
                  </button>
                ) : (
                  <>
                    <button disabled className="h-12 px-8 rounded-xl bg-amber-400/80 text-white font-semibold text-base flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" /> Warte auf Anmeldung…
                    </button>
                    <button onClick={cancelLogin} className="mt-3 text-sm text-zinc-400 active:text-zinc-200">Abbrechen</button>
                  </>
                )}
                {!polling && <p className="text-sm text-zinc-400 mt-3">Du wirst kurz zu plex.tv weitergeleitet.</p>}
                {loginError === 'timeout' && (
                  <button onClick={startLogin} className="mt-3 text-sm text-amber-400 font-medium">Erneut versuchen</button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900 mb-5">
                  {user.thumb ? (
                    <img src={user.thumb} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 font-bold shrink-0">
                      {(user.username || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-zinc-100 truncate">{user.username || 'Plex User'}</div>
                    {user.email && <div className="text-xs text-zinc-500 truncate">{user.email}</div>}
                  </div>
                  <button onClick={doLogout} className="text-zinc-400 active:text-zinc-200 text-sm flex items-center gap-1.5 shrink-0">
                    <LogOut className="w-4 h-4" /> Abmelden
                  </button>
                </div>

                {serverFields}

                {testResult && testResult.ok && (
                  <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" /> Verbunden mit <span className="font-semibold">{testResult.server_name}</span> (v{testResult.version}) · {testResult.library_sections?.length || 0} Film-Bibliotheken
                  </div>
                )}
                {testError && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {testError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-5">
                  <button
                    onClick={doTest}
                    disabled={!hostname || testing}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-100 font-medium flex items-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />} Verbindung testen
                  </button>
                  <button
                    onClick={doSave}
                    disabled={saving || !hostname}
                    className="px-4 py-2.5 rounded-xl bg-amber-400 text-zinc-950 font-semibold flex items-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-amber-400/20"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved ? 'Gespeichert' : 'Speichern'}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {loaded && activeTab === 'bibliotheken' && (
          <section>
            <h2 className="text-lg font-semibold mb-1">Plex Bibliotheken</h2>
            <p className="text-sm text-zinc-400 mb-4">Wähle die Film-Bibliotheken, aus denen PlexDice würfeln soll, und synchronisiere sie.</p>

            {!user && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-100 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Bitte zuerst im Plex-Tab anmelden.
              </div>
            )}

            {user && testing && (
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3"><Loader2 className="w-4 h-4 animate-spin" /> Bibliotheken werden geladen…</div>
            )}

            {user && !testing && sections.length === 0 && (
              <button
                onClick={doTest}
                disabled={!hostname}
                className="w-full p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-zinc-300 text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-40"
              >
                <RefreshCw className="w-4 h-4" /> Bibliotheken vom Server laden
              </button>
            )}

            {user && sections.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {sections.map((sec) => {
                    const on = selectedLibraries.includes(sec.id);
                    return (
                      <button
                        key={sec.id}
                        onClick={() => toggleLibrary(sec.id)}
                        className={`p-4 rounded-2xl text-left transition-colors active:scale-[0.98] ${on ? 'bg-amber-400/15 border-2 border-amber-400' : 'bg-zinc-900/60 border-2 border-zinc-800'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Library className={`w-5 h-5 ${on ? 'text-amber-400' : 'text-zinc-500'}`} />
                          {on && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                        <div className="mt-2 font-medium text-zinc-100 truncate">{sec.title}</div>
                        <div className="text-xs text-zinc-500">ID {sec.id}</div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={doSync}
                  disabled={syncing || selectedLibraries.length === 0}
                  className="w-full mt-5 py-3 rounded-xl bg-amber-400 text-zinc-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-amber-400/20"
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  {syncing ? 'Synchronisiere…' : 'Bibliotheken synchronisieren'}
                </button>
              </>
            )}

            {syncResult && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm flex items-center gap-2">
                <Check className="w-4 h-4" /> {syncResult.count} Filme synchronisiert
              </div>
            )}
            {syncError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {syncError}
              </div>
            )}
          </section>
        )}

        {loaded && activeTab === 'quiz' && <QuizConfig />}

        {loaded && (activeTab === 'allgemein' || activeTab === 'ueber') && (
          <section className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center">
            <Info className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-400">
              {activeTab === 'ueber'
                ? 'PlexDice — würfelt einen zufälligen Film aus deiner Plex-Bibliothek.'
                : 'Allgemeine Einstellungen folgen in einer späteren Version.'}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
