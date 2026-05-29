import DieIcon from './DieIcon';

// Shared product header: the PlexDice die + a sans-serif wordmark. The active product
// gets the bold zinc-100 half; the sibling trails muted and smaller on the same baseline.
// Idle: no fill, no rounded surface, no border — the wordmark sits transparently on the
// page background and blends in. `sticky` (post-roll) pins it flush under the safe-area
// inset (z-30, below the scrim) with a SOLID background so scrolled content slides
// cleanly behind it — a translucent/blurred bar let content bleed through and read as a
// half-clipped overlay. `rightSlot` lets callers inject a control beside the wordmark.
export default function AppHeader({ product, sticky = false, rightSlot = null }) {
  const dice = product === 'dice';
  const primary = dice ? 'Plex Dice' : 'Plex Quiz';
  const secondary = dice ? '& Quiz' : '& Dice';
  const stickyClass = sticky
    ? 'sticky top-[env(safe-area-inset-top)] z-30 bg-zinc-950'
    : 'bg-transparent';
  return (
    <header className={`mb-2 ${stickyClass}`}>
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
