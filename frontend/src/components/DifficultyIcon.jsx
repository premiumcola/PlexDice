export default function DifficultyIcon({ level = 1, className = "" }) {
  // level: 1 = leicht, 2 = mittel, 3 = schwer
  const lvl = Math.max(1, Math.min(3, level));
  return (
    <svg viewBox="0 0 46 9" className={className} fill="none" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 16}
          y={1}
          width={12}
          height={7}
          rx={3.5}
          fill={i < lvl ? "currentColor" : "none"}
          stroke={i < lvl ? "none" : "currentColor"}
          strokeWidth={1.4}
          opacity={i < lvl ? 1 : 0.45}
        />
      ))}
    </svg>
  );
}
