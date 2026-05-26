// The PlexDice isometric die — shared by the product header (AppHeader) and the
// About screen, so the mark is defined once.
export default function DieIcon({ className = 'w-12 h-12' }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
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
  );
}
