// Tiny Web Audio synth — no audio files. Context is created lazily on a user
// gesture (the "Los geht's" tap) so iOS Safari doesn't block it.
let ctx = null;

export function initAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
  return ctx;
}

function blip(freq, dur, type, peak) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function sweep(from, to, dur, type, peak) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const tick = (freq = 880) => blip(freq, 0.035, 'sine', 0.16);
export const buzz = () => sweep(440, 220, 0.3, 'sawtooth', 0.18); // wrong / timeout
export const chime = () => sweep(660, 990, 0.2, 'triangle', 0.2); // correct

// Tick cadence + pitch by fraction of time remaining (C9 escalation schedule).
export function tickParams(frac) {
  if (frac > 0.5) return { hz: 1, freq: 880 };
  if (frac > 0.25) return { hz: 1.5, freq: 880 };
  if (frac > 0.1) return { hz: 2.5, freq: 880 };
  if (frac > 0.05) return { hz: 4, freq: 1100 };
  return { hz: 5, freq: 1320 };
}

// Preview sequence for the settings "Test" button.
export function playMenacePreview() {
  initAudio();
  if (!ctx) return;
  const steps = [880, 880, 880, 1100, 1100, 1320, 1320, 1320];
  let delay = 0;
  steps.forEach((f, i) => {
    const gap = i < 3 ? 350 : i < 5 ? 240 : 180;
    setTimeout(() => tick(f), delay);
    delay += gap;
  });
  setTimeout(buzz, delay + 100);
}
