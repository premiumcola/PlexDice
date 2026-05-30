import DieIcon from './DieIcon';
import { handleLogoTap } from '../debug';
import { navigate } from '../router';
import { homePath } from '../home';

// Shared product header: the PlexDice die + a sans-serif wordmark. Fully TRANSPARENT — it
// inherits the page background (no fill, no rounded surface, no border) and is NOT sticky,
// so it sits flush at the top of <main>'s content (already inset below the notch via main's
// safe-area padding) with one small fixed breathing gap (pt-2). Because it never pins and
// has no scroll-margin/offset hacks, the top spacing is identical in the idle and post-roll
// states — no dead space appears after a roll. `rightSlot` injects a control beside it.
export default function AppHeader({ product, rightSlot = null }) {
  const dice = product === 'dice';
  const primary = dice ? 'Plex Dice' : 'Plex Quiz';
  const secondary = dice ? '& Quiz' : '& Dice';

  // Tap the logo/wordmark → app start page (home.js). The 5-tap eruda toggle (debug.js) rides on
  // the same handler — both run on every tap, and navigating home repeatedly is harmless.
  const onLogo = () => {
    handleLogoTap();
    navigate(homePath());
  };

  return (
    <header className="pt-2 mb-2">
      <div className="flex items-center gap-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Zur Startseite"
          onClick={onLogo}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLogo(); } }}
          className="flex flex-1 min-w-0 items-center gap-3 min-h-[44px] cursor-pointer select-none active:opacity-80 transition-opacity"
        >
          <DieIcon className="w-12 h-12 sm:w-14 sm:h-14 shrink-0" />
          <h1 className="font-sans font-extrabold tracking-tight leading-none flex-1 min-w-0 text-2xl sm:text-3xl lg:text-4xl">
            <span className="text-zinc-100">{primary}</span>
            <span className="text-zinc-500 font-medium ml-2 text-base sm:text-lg">{secondary}</span>
          </h1>
        </div>
        {rightSlot}
      </div>
    </header>
  );
}
