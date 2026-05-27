// Countdown ring: oversampled SVG (viewBox 100) so the round-capped progress arc
// renders crisp at any display size. A zinc-100 backplate fills the interior so the
// poster behind never bleeds in. Amber until the last 5 s, then rose for urgency.
const CIRCUMFERENCE = 276.46; // 2π·44
const AMBER = 'rgb(245 158 11)';
const ROSE = 'rgb(225 29 72)';

export default function RadialCountdown({ remaining, duration }) {
  const secs = Math.max(0, Math.ceil(remaining / 1000));
  const pct = Math.max(0, Math.min(1, duration ? remaining / duration : 0));
  const color = secs <= 5 ? ROSE : AMBER;

  return (
    <div className="inline-flex rounded-full ring-1 ring-zinc-200">
      <svg
        viewBox="0 0 100 100"
        shapeRendering="geometricPrecision"
        className="w-14 h-14 sm:w-16 sm:h-16"
      >
        <circle cx="50" cy="50" r="46" fill="rgb(244 244 245)" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(228 228 231)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * pct} ${CIRCUMFERENCE}`}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.12s linear, stroke 0.3s linear' }}
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="ui-sans-serif, system-ui"
          fontWeight="700"
          fontSize="34"
          fill={color}
        >
          {secs}
        </text>
      </svg>
    </div>
  );
}
