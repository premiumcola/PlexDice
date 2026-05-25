import { useState, useEffect, useCallback } from 'react';
import {
  Server, RefreshCw, Loader2, Check, AlertCircle, Save, Library,
  Settings as SettingsIcon, Info, Database,
} from 'lucide-react';
import { getSettings, saveSettings, discoverServers, testConnection, refreshLibrary } from '../api';

const TABS = [
  { id: 'allgemein', label: 'Allgemein' },
  { id: 'plex', label: 'Plex' },
  { id: 'bibliotheken', label: 'Bibliotheken' },
  { id: 'ueber', label: 'Über' },
];

const DEFAULT_PORT = '32400';

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

  const [token, setToken] = useState('');
  const [tokenDirty, setTokenDirty] = useState(false);
  const [tokenSet, setTokenSet] = useState(false);

  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState(DEFAULT_PORT);
  const [ssl, setSsl] = useState(true);

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

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        const plex = s.plex || {};
        const parsed = parseUrl(plex.url);
        setHostname(parsed.hostname);
        setPort(parsed.port);
        setSsl(plex.ssl != null ? plex.ssl : parsed.ssl);
        setTokenSet(Boolean(plex.tokenSet));
        setSelectedLibraries(plex.libraries || []);
      } catch {
        /* ignore — first run */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const composeUrl = useCallback(
    () => `${ssl ? 'https' : 'http'}://${hostname.trim()}:${(port || DEFAULT_PORT).toString().trim()}`,
    [ssl, hostname, port],
  );

  // Token to send: the freshly typed one, else let the backend fall back to the stored one.
  const tokenForRequest = tokenDirty ? token : '';

  const doDiscover = async () => {
    setDiscovering(true);
    setDiscoverError('');
    try {
      const { servers: list } = await discoverServers(tokenForRequest);
      setServers(list || []);
      if (!list || list.length === 0) setDiscoverError('Keine Server gefunden');
    } catch (e) {
      setDiscoverError(e.message || 'Token ungültig');
    } finally {
      setDiscovering(false);
    }
  };

  const onSelectServer = (name) => {
    const server = servers.find((s) => s.name === name);
    if (!server || !server.connections.length) return;
    const conn = server.connections.find((c) => c.https) || server.connections[0];
    try {
      setHostname(new URL(conn.uri).hostname);
    } catch {
      setHostname(conn.address);
    }
    setPort(String(conn.port));
    setSsl(Boolean(conn.https));
  };

  const doTest = useCallback(async () => {
    setTesting(true);
    setTestError('');
    setTestResult(null);
    try {
      const res = await testConnection({ url: composeUrl(), token: tokenForRequest, ssl });
      setTestResult(res);
      setSections(res.library_sections || []);
    } catch (e) {
      setTestError(e.message || 'Verbindung fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  }, [composeUrl, tokenForRequest, ssl]);

  const buildPatch = (extra = {}) => {
    const plex = { url: composeUrl(), ssl, libraries: selectedLibraries, ...extra };
    if (tokenDirty && token) plex.token = token;
    return { plex };
  };

  const doSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const s = await saveSettings(buildPatch());
      setTokenSet(Boolean(s.plex?.tokenSet));
      setTokenDirty(false);
      setToken('');
      setSaved(true);
      if (s.plex?.tokenSet && s.plex?.url) onConnected?.();
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
      await saveSettings(buildPatch()); // persist library selection first
      const res = await refreshLibrary();
      setSyncResult(res);
      onConnected?.();
    } catch (e) {
      setSyncError(e.message || 'Synchronisierung fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  // When opening the Bibliotheken tab without a section list yet, fetch it.
  useEffect(() => {
    if (activeTab === 'bibliotheken' && sections.length === 0 && !testing && (tokenSet || tokenDirty) && hostname) {
      doTest();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const canConnect = (tokenDirty && token) || tokenSet;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-28 sm:pb-12">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-400/20">
            <SettingsIcon className="w-5 h-5 text-zinc-950" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 overflow-x-auto mb-6 p-1 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${activeTab === t.id ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 active:text-zinc-200'}`}
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
            <p className="text-sm text-zinc-400 mb-4">Verbinde deinen Plex Server. Der Token wird nur serverseitig gespeichert und nie an den Browser zurückgegeben.</p>

            <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 px-4 divide-y divide-zinc-800/60">
              <Row label="Plex Token" hint="X-Plex-Token deines Accounts">
                <input
                  type="password"
                  value={tokenDirty ? token : ''}
                  onChange={(e) => { setToken(e.target.value); setTokenDirty(true); }}
                  placeholder={tokenSet ? '•••• gespeichert' : 'Token eingeben'}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-400/60"
                  autoComplete="off"
                />
              </Row>

              <Row label="Server">
                <div className="flex gap-2">
                  <select
                    onChange={(e) => onSelectServer(e.target.value)}
                    defaultValue=""
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 outline-none focus:ring-2 focus:ring-amber-400/60"
                  >
                    <option value="" disabled>{servers.length ? 'Server wählen' : 'Erst Server laden →'}</option>
                    {servers.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={doDiscover}
                    disabled={!canConnect || discovering}
                    className="px-3 py-2 rounded-xl bg-amber-400 text-zinc-950 font-medium flex items-center gap-1.5 disabled:opacity-40 active:scale-[0.97] transition-transform"
                    title="Verfügbare Server laden"
                  >
                    {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
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
            </div>

            {/* Feedback */}
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
                disabled={!canConnect || !hostname || testing}
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
          </section>
        )}

        {loaded && activeTab === 'bibliotheken' && (
          <section>
            <h2 className="text-lg font-semibold mb-1">Plex Bibliotheken</h2>
            <p className="text-sm text-zinc-400 mb-4">Wähle die Film-Bibliotheken, aus denen PlexDice würfeln soll, und synchronisiere sie.</p>

            {testing && (
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3"><Loader2 className="w-4 h-4 animate-spin" /> Bibliotheken werden geladen…</div>
            )}

            {!testing && sections.length === 0 && (
              <button
                onClick={doTest}
                disabled={!canConnect || !hostname}
                className="w-full p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-zinc-300 text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-40"
              >
                <RefreshCw className="w-4 h-4" /> Bibliotheken vom Server laden
              </button>
            )}

            {sections.length > 0 && (
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
            )}

            {sections.length > 0 && (
              <button
                onClick={doSync}
                disabled={syncing || selectedLibraries.length === 0}
                className="w-full mt-5 py-3 rounded-xl bg-amber-400 text-zinc-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-amber-400/20"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                {syncing ? 'Synchronisiere…' : 'Bibliotheken synchronisieren'}
              </button>
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
