import { useMemo } from 'react';

const COLORS = ['#f5a623', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#34d399', '#fde047'];

// Shared confetti burst. `variant` controls the intensity:
//   'bursts' — three offset bursts, 22 particles each + emoji stars (Würfeln's big throw)
//   'mini'   — one centred burst, 14 particles, ~1.0 s, no stars (Quiz: lively, not loud)
// The component carries its own keyframes so callers need no CSS.
export default function Fireworks({ variant = 'bursts' }) {
  const particles = useMemo(() => {
    const mini = variant === 'mini';
    const bursts = mini
      ? [{ x: 50, y: 45 }]
      : [{ x: 50, y: 35 }, { x: 25, y: 55 }, { x: 75, y: 50 }];
    const count = mini ? 14 : 22;
    const out = [];
    bursts.forEach((burst, bi) => {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const distance = mini ? 50 + Math.random() * 80 : 80 + Math.random() * 140;
        out.push({
          id: `${bi}-${i}`,
          x: burst.x,
          y: burst.y,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: mini ? 2 + Math.random() * 3 : 2 + Math.random() * 4,
          delay: (mini ? 0 : bi * 0.15) + Math.random() * 0.1,
          duration: mini ? 0.8 + Math.random() * 0.3 : 0.9 + Math.random() * 0.5,
        });
      }
    });
    return out;
  }, [variant]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <style>{`
        @keyframes firework {
          0% { transform: translate(0, 0) scale(0); opacity: 1; }
          15% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
        @keyframes starPop {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          30% { transform: scale(1.6) rotate(180deg); opacity: 1; }
          60% { transform: scale(1.1) rotate(280deg); opacity: 0.9; }
          100% { transform: scale(2.4) rotate(360deg); opacity: 0; }
        }
      `}</style>
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.size / 10}
            fill={p.color}
            style={{
              animation: `firework ${p.duration}s ease-out ${p.delay}s forwards`,
              transformOrigin: `${p.x}px ${p.y}px`,
              '--dx': `${p.dx / 10}px`,
              '--dy': `${p.dy / 10}px`,
            }}
          />
        ))}
      </svg>
      {variant !== 'mini' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-full h-full">
            {['✨', '⭐', '✨'].map((emoji, i) => (
              <div
                key={i}
                className="absolute text-4xl"
                style={{
                  left: `${20 + i * 30}%`,
                  top: `${30 + (i % 2) * 15}%`,
                  animation: `starPop 0.8s ease-out ${i * 0.1}s both`,
                }}
              >
                {emoji}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
