// Radial countdown ring + big center number. Escalates calm → thriller as time
// drains: amber → orange → red → deep red, with pulse and a number flash near 0.
const SIZE = 132;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function stage(frac) {
  if (frac > 0.5) return { color: '#f5a623', pulse: 0, flash: false };
  if (frac > 0.25) return { color: '#ff7a00', pulse: 0, flash: false };
  if (frac > 0.1) return { color: '#ef4444', pulse: 1.5, flash: false };
  return { color: '#b91c1c', pulse: 4, flash: true };
}

export default function RadialCountdown({ remaining, duration }) {
  const frac = Math.max(0, Math.min(1, remaining / duration));
  const secs = Math.ceil(remaining / 1000);
  const { color, pulse, flash } = stage(frac);
  const dur = pulse ? `${(1 / pulse).toFixed(2)}s` : '0s';

  return (
    <div
      className="relative"
      style={{ width: SIZE, height: SIZE, animation: pulse ? `pfRingPulse ${dur} ease-in-out infinite` : 'none' }}
    >
      <style>{`
        @keyframes pfRingPulse {0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        @keyframes pfNumFlash {0%,100%{opacity:1}50%{opacity:0.35}}
      `}</style>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#27272a" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.4s linear' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-extrabold tabular-nums"
        style={{ color, fontSize: 44, animation: flash ? 'pfNumFlash 0.25s steps(1) infinite' : 'none' }}
      >
        {secs}
      </div>
    </div>
  );
}
