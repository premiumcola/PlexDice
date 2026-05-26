// Shared product header: the PlexDice die + a sans-serif wordmark. The active product
// gets the bold zinc-100 half; the sibling trails muted and smaller on the same baseline.
export default function AppHeader({ product }) {
  const dice = product === 'dice';
  const primary = dice ? 'Plex Dice' : 'Plex Quiz';
  const secondary = dice ? '& Quiz' : '& Dice';
  return (
    <header className="mb-6 pb-4 border-b border-zinc-900">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 200 200" className="w-12 h-12 sm:w-14 sm:h-14 shrink-0" aria-hidden="true">
          <defs>
            <linearGradient id="die-t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f5a623" /><stop offset="1" stopColor="#e08e15" /></linearGradient>
            <linearGradient id="die-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c97a10" /><stop offset="1" stopColor="#8a5208" /></linearGradient>
            <linearGradient id="die-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b46c0c" /><stop offset="1" stopColor="#704206" /></linearGradient>
          </defs>
          <path d="M 100 30 L 170 70 L 100 110 L 30 70 Z" fill="url(#die-t)" stroke="#000" strokeWidth="2" />
          <path d="M 30 70 L 100 110 L 100 180 L 30 140 Z" fill="url(#die-l)" stroke="#000" strokeWidth="2" />
          <path d="M 170 70 L 100 110 L 100 180 L 170 140 Z" fill="url(#die-r)" stroke="#000" strokeWidth="2" />
          <path d="M 88 55 L 100 75 L 88 95 L 96 95 L 108 75 L 96 55 Z" fill="#0a0a0a" opacity="0.85" />
          <circle cx="50" cy="100" r="4" fill="#0a0a0a" opacity="0.7" />
          <circle cx="65" cy="120" r="4" fill="#0a0a0a" opacity="0.7" />
          <circle cx="80" cy="140" r="4" fill="#0a0a0a" opacity="0.7" />
          <circle cx="125" cy="105" r="4" fill="#0a0a0a" opacity="0.7" />
          <circle cx="155" cy="135" r="4" fill="#0a0a0a" opacity="0.7" />
        </svg>
        <h1 className="font-sans font-extrabold tracking-tight leading-none flex-1 min-w-0 text-2xl sm:text-3xl lg:text-4xl">
          <span className="text-zinc-100">{primary}</span>
          <span className="text-zinc-500 font-medium ml-2 text-base sm:text-lg">{secondary}</span>
        </h1>
      </div>
    </header>
  );
}
