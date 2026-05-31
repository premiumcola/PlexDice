// Difficulty as signal bars: three bars of INCREASING height; the first `level` bars are filled
// (accent #f5a623 by default), the rest stay faint. Tall + flat so the level reads at a glance.
// `accent` is overridable for placement on an accent-coloured surface (where #f5a623 would vanish).
export default function DifficultyIcon({ level = 1, className = "", accent = "#f5a623" }) {
  // level: 1 = leicht, 2 = mittel, 3 = schwer
  const lvl = Math.max(1, Math.min(3, level));
  const bars = [
    { x: 1, h: 10 },
    { x: 10.5, h: 15 },
    { x: 20, h: 20 },
  ];
  return (
    <svg viewBox="0 0 27 22" className={className} fill="none" aria-hidden="true">
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={21 - b.h}
          width={6}
          height={b.h}
          rx={2}
          fill={i < lvl ? accent : "currentColor"}
          opacity={i < lvl ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}
