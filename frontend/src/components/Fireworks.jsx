import { useMemo } from 'react';

const COLORS = ['#f5a623', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#34d399', '#fde047'];

// Shared confetti / fireworks burst.
//   variant 'bursts' — three offset bursts, 22 particles each + emoji stars (Würfeln)
//   variant 'mini'   — one centred burst, 14 particles, no stars (subtle)
//   origin {x,y}     — viewport-PIXEL launch point: bursts originate above it and
//                      explode across the viewport (Quiz correct-answer rockets).
// The component carries its own keyframes so callers need no CSS.
export default function Fireworks({ variant = 'bursts', origin = null }) {
  const { particles, viewBox, stars } = useMemo(() => {
    if (origin) {
      // Rockets: bursts offset up-and-out from the card centre, in viewport pixels.
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 1000;
      const bursts = [
        { x: origin.x - 80, y: origin.y - 180, delay: 0 },
        { x: origin.x, y: origin.y - 260, delay: 0.18 },
        { x: origin.x + 80, y: origin.y - 180, delay: 0.36 },
      ];
      const out = [];
      bursts.forEach((burst, bi) => {
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.3;
          const distance = 70 + Math.random() * 130;
          out.push({
            id: `${bi}-${i}`,
            cx: burst.x,
            cy: burst.y,
            r: 3 + Math.random() * 5,
            dx: Math.cos(angle) * distance,
            dy: Math.sin(angle) * distance,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            delay: burst.delay + Math.random() * 0.1,
            duration: 0.9 + Math.random() * 0.5,
          });
        }
      });
      return { particles: out, viewBox: `0 0 ${vw} ${vh}`, stars: false };
    }

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
          cx: burst.x,
          cy: burst.y,
          r: (mini ? 2 + Math.random() * 3 : 2 + Math.random() * 4) / 10,
          dx: (Math.cos(angle) * distance) / 10,
          dy: (Math.sin(angle) * distance) / 10,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          delay: (mini ? 0 : bi * 0.15) + Math.random() * 0.1,
          duration: mini ? 0.8 + Math.random() * 0.3 : 0.9 + Math.random() * 0.5,
        });
      }
    });
    return { particles: out, viewBox: '0 0 100 100', stars: !mini };
  }, [variant, origin]);

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
      <svg className="w-full h-full" viewBox={viewBox} preserveAspectRatio="none">
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill={p.color}
            style={{
              animation: `firework ${p.duration}s ease-out ${p.delay}s forwards`,
              transformOrigin: `${p.cx}px ${p.cy}px`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
            }}
          />
        ))}
      </svg>
      {stars && (
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
