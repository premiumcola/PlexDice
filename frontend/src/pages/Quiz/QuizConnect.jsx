import { User } from 'lucide-react';
import { OPTIONS_BLUR_NAME_BANDS } from './util';
import { renderRedactedPlot } from './redact';

// One connect item rendered to fill its row height: a film poster (2:3), an actor portrait (1:1
// rounded) or a short text token (chip). Posters/portraits keep their aspect (object-cover, never
// distorted). For actor relations the printed names along the poster edges are blurred (reused band
// treatment). The inner edge carries the connection node (handled by the column below).
function ConnectItem({ item, relation }) {
  if (item.kind === 'image') {
    const portrait = item.aspect === '1/1';
    const bands = !portrait && OPTIONS_BLUR_NAME_BANDS.has(relation);
    return (
      <div className={`relative h-full ${portrait ? 'aspect-square' : 'aspect-[2/3]'} rounded-xl overflow-hidden bg-zinc-800 ring-1 ring-zinc-700`}>
        {item.content ? (
          <img
            src={item.content}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover ${portrait ? 'object-top' : 'object-center'}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <User className="w-1/3 h-1/3 text-zinc-600" />
          </div>
        )}
        {bands && (
          <>
            <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: '13%', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', background: 'linear-gradient(to bottom, rgba(9,9,11,0.5), rgba(9,9,11,0))' }} />
            <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '13%', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', background: 'linear-gradient(to top, rgba(9,9,11,0.5), rgba(9,9,11,0))' }} />
          </>
        )}
      </div>
    );
  }
  return (
    <div className="h-full max-w-full flex items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-zinc-700 px-3 py-1.5 text-center">
      <span className="text-sm sm:text-base font-semibold text-zinc-100 leading-tight line-clamp-3">
        {renderRedactedPlot(item.content)}
      </span>
    </div>
  );
}

// One column of 5 equal-height rows. Items hug the inner edge (toward the centre gap) so the
// connection node sits closest to the other column. The whole row is the touch target.
function Column({ ids, byId, relation, side }) {
  const inner = side === 'left' ? 'flex-row' : 'flex-row-reverse';
  return (
    <div className="flex-1 min-w-0 h-full flex flex-col gap-2 sm:gap-3">
      {ids.map((id) => (
        <div key={id} className={`flex-1 min-h-0 flex items-center gap-1.5 ${inner}`}>
          <div className="h-full flex items-center min-w-0 max-w-full">
            <ConnectItem item={byId[id]} relation={relation} />
          </div>
          <span className="shrink-0 w-3 h-3 rounded-full bg-zinc-600 ring-2 ring-zinc-900" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

// "Verbinden" connect round: two balanced columns of mixed item types; the player links left<->right
// (interaction added in G2) and submits with "Prüfen" (G3). Fits one dvh screen — equal flex rows
// scale every item down so nothing overflows the page.
export default function QuizConnect({ question }) {
  const byId = Object.fromEntries(question.items.map((it) => [it.id, it]));
  const { left, right } = question.columns;
  const linked = 0;
  const total = left.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex-1 min-h-0 flex items-stretch gap-3 sm:gap-6">
        <Column ids={left} byId={byId} relation={question.relation} side="left" />
        <Column ids={right} byId={byId} relation={question.relation} side="right" />
      </div>
      <button
        type="button"
        disabled
        className="shrink-0 mt-3 w-full rounded-xl py-3 font-semibold bg-zinc-800 text-zinc-500 disabled:cursor-not-allowed"
      >
        Prüfen ({linked} / {total})
      </button>
    </div>
  );
}
