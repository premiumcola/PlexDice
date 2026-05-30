import DieIcon from './DieIcon';

// Shared product header: the PlexDice die + a sans-serif wordmark. The active product
// gets the bold zinc-100 half; the sibling trails muted and smaller on the same baseline.
// Idle: NO fill, NO rounded surface, NO border — the wordmark sits transparently on the
// page background (so the page's subtle gradient shows through, never a pasted-on box).
// `sticky` (post-roll) pins it under the safe-area inset (z-30, below the scrim) with a
// SOLID zinc-950 background so scrolled card content slides cleanly BEHIND it — a
// transparent/translucent bar lets the title/poster/facts bleed through and read as a
// half-clipped overlay over the wordmark. A small pt gives breathing room below the notch.
// `rightSlot` injects a control beside it.
export default function AppHeader({ product, sticky = false, rightSlot = null }) {
  const dice = product === 'dice';
  const primary = dice ? 'Plex Dice' : 'Plex Quiz';
  const secondary = dice ? '& Quiz' : '& Dice';
  const stickyClass = sticky ? 'sticky top-[env(safe-area-inset-top)] z-30 bg-zinc-950' : '';
  return (
    <header className={`pt-2 mb-2 ${stickyClass}`}>
      <div className="flex items-center gap-3">
        <DieIcon className="w-12 h-12 sm:w-14 sm:h-14 shrink-0" />
        <h1 className="font-sans font-extrabold tracking-tight leading-none flex-1 min-w-0 text-2xl sm:text-3xl lg:text-4xl">
          <span className="text-zinc-100">{primary}</span>
          <span className="text-zinc-500 font-medium ml-2 text-base sm:text-lg">{secondary}</span>
        </h1>
        {rightSlot}
      </div>
    </header>
  );
}
