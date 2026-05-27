// Quiz sound effects from WAV files. A single AudioContext (created lazily, unlocked
// on a user gesture) plays decoded buffers; each file is fetched + decoded once and
// cached. Everything is fire-and-forget and no-ops safely if a file 404s.
const SOURCES = {
  click: '/sounds/01_click.wav',
  tick: '/sounds/02_tick.wav',
  bomb: '/sounds/03_bomb.wav',
  alarm: '/sounds/04_alarm.wav',
  correct: '/sounds/05_correct.wav',
  loser: '/sounds/06_loserhorn.wav',
  drumroll: '/sounds/07_drumroll.wav',
};

const DEV = import.meta.env.DEV;
let ctx = null;
let unlocked = false; // iOS only plays once a gesture has unlocked the context
let soundEnabled = true; // mirrors the quiz Sound toggle; read synchronously here
const buffers = {}; // name -> decoded AudioBuffer
const loading = {}; // name -> Promise<AudioBuffer | null>

function ensureCtx() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
  return ctx;
}

// Create/resume the context on a user gesture (the Quiz "Los geht's" tap) so the first
// in-game sound isn't blocked by the browser's autoplay policy.
export function initAudio() {
  return ensureCtx();
}

// iOS Safari only lets Web Audio play after a real gesture creates + resumes the
// context AND a buffer has been started inside that gesture. Do all three here.
export function unlockAudio() {
  if (unlocked) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try {
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore — context not ready */
  }
  unlocked = true;
}

// Read synchronously inside playSound; fed from the quiz Sound toggle / round config.
export function setSoundEnabled(on) {
  soundEnabled = on !== false;
}

// Unlock on the first gesture anywhere, capturing before any tap handler runs, so by
// the time a button is pressed the audio context is already alive.
if (typeof window !== 'undefined') {
  const evts = ['touchstart', 'touchend', 'click', 'keydown'];
  const handler = () => {
    unlockAudio();
    evts.forEach((e) => document.removeEventListener(e, handler, true));
  };
  evts.forEach((e) => document.addEventListener(e, handler, { capture: true, passive: true }));
}

function loadBuffer(name) {
  if (buffers[name]) return Promise.resolve(buffers[name]);
  if (loading[name]) return loading[name];
  const url = SOURCES[name];
  const ac = ensureCtx();
  if (!url || !ac) return Promise.resolve(null);
  loading[name] = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => ac.decodeAudioData(data))
    .then((decoded) => {
      buffers[name] = decoded;
      return decoded;
    })
    .catch((err) => {
      if (DEV) console.warn(`[audio] could not load "${name}" (${url}):`, err);
      return null;
    });
  return loading[name];
}

// Decode all sounds up front so the first in-game play has zero latency.
export function preloadSounds() {
  ensureCtx();
  Object.keys(SOURCES).forEach(loadBuffer);
}

export function playSound(name, { volume = 1.0 } = {}) {
  if (!soundEnabled) return;
  if (!ctx) return; // no gesture yet → context not created, nothing to play
  if (ctx.state === 'suspended') ctx.resume().catch(() => {}); // iOS can suspend mid-session
  const start = (buffer) => {
    if (!buffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volume));
      src.connect(gain).connect(ctx.destination);
      src.start();
    } catch {
      /* node creation can throw if the context died — ignore */
    }
  };
  if (buffers[name]) start(buffers[name]);
  else loadBuffer(name).then(start);
}

// Settings "Test" button: a short tick → bomb → alarm escalation preview.
export function playMenacePreview() {
  ensureCtx();
  const seq = [['tick', 0], ['tick', 350], ['tick', 700], ['bomb', 1000], ['bomb', 1250], ['alarm', 1600]];
  seq.forEach(([name, at]) => setTimeout(() => playSound(name), at));
}
