import DieIcon from './DieIcon';

// Shared product header: the PlexDice die + a sans-serif wordmark. The active product
// gets the bold zinc-100 half; the sibling trails muted and smaller on the same baseline.
// `sticky` pins the header just under the safe-area inset (z-30, below the scrim);
// `rightSlot` lets callers inject a contextual control beside the wordmark.
export default function AppHeader({ product, sticky = false, rightSlot = null }) {
  const dice = product === 'dice';
  const primary = dice ? 'Plex Dice' : 'Plex Quiz';
  const secondary = dice ? '& Quiz' : '& Dice';
  const stickyClass = sticky
    ? 'sticky top-[calc(env(safe-area-inset-top)+12px)] z-30 bg-zinc-950/95 backdrop-blur-sm'
    : '';
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
