import { Fragment, useRef, useState } from 'react';
import { Link2, X, Plus } from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core';

const LONG_PRESS_MS = 450;

// One selected genre. Draggable + droppable (drop A onto B → AND-merge) + tap +
// long-press (enter "verbinden" mode). Plain taps still register thanks to the
// pointer sensor's 6px activation distance.
function GenreChip({ genre, single, activeId, overId, connectMode, onTap, onRemove, onLongPress }) {
  const { setNodeRef: dragRef, listeners, attributes } = useDraggable({ id: genre });
  const { setNodeRef: dropRef } = useDroppable({ id: genre });
  const timer = useRef(null);
  const fired = useRef(false);
  const setRef = (el) => { dragRef(el); dropRef(el); };

  const down = (e) => {
    listeners?.onPointerDown?.(e);
    fired.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { fired.current = true; onLongPress(genre); }, LONG_PRESS_MS);
  };
  const cancel = () => clearTimeout(timer.current);
  const click = () => {
    if (fired.current) { fired.current = false; return; } // long-press already handled it
    onTap(genre);
  };

  const isActive = activeId === genre;
  const isOver = overId === genre && activeId && activeId !== genre;
  const isSource = connectMode === genre;
  const eligible = connectMode && !isSource; // a valid merge target in connect mode
  const dimmed = (activeId && !isActive && !isOver) || (connectMode && false);

  let ring = '';
  if (isOver || eligible) ring = 'ring-2 ring-amber-200';
  if (isSource) ring = 'ring-2 ring-amber-200 animate-pulse';

  return (
    <span
      ref={setRef}
      {...attributes}
      onPointerDown={down}
      onPointerMove={cancel}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onClick={click}
      role="button"
      tabIndex={0}
      style={{ touchAction: 'none', opacity: isActive ? 0.4 : dimmed ? 0.45 : 1 }}
      className={`relative inline-flex items-center gap-1 min-h-[44px] cursor-pointer select-none ${ring} ${
        single ? 'px-3 rounded-xl bg-amber-400 text-zinc-950 font-medium text-sm' : 'pl-2.5 pr-1 text-zinc-950 font-medium text-sm'
      }`}
    >
      {genre}
      {!single && (
        <span
          role="button"
          aria-label={`${genre} aus Gruppe entfernen`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(genre); }}
          className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-950/70 active:bg-zinc-950/15"
        >
          <X className="w-3.5 h-3.5" />
        </span>
      )}
      {eligible && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 text-[10px] text-zinc-950/70">
          <Plus className="w-3 h-3" />verbinden
        </span>
      )}
    </span>
  );
}

export default function GenrePicker({ groups, allGenres, onChange }) {
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [connectMode, setConnectMode] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const selected = new Set(groups.flat());
  const unselected = allGenres.filter((g) => !selected.has(g));

  // --- operations (controlled: emit the next groups) ---
  const addGenre = (g) => onChange([...groups, [g]]);
  const removeGenre = (g) =>
    onChange(groups.map((grp) => grp.filter((x) => x !== g)).filter((grp) => grp.length));
  const dissolve = (gi) => onChange(groups.filter((_, i) => i !== gi));
  const mergeInto = (drag, target) => {
    if (drag === target) return;
    const stripped = groups.map((grp) => grp.filter((x) => x !== drag));
    onChange(stripped.map((grp) => (grp.includes(target) ? [...grp, drag] : grp)).filter((grp) => grp.length));
  };
  const detach = (g) => {
    const grp = groups.find((x) => x.includes(g));
    if (!grp || grp.length === 1) return; // already standalone
    const without = groups.map((x) => x.filter((y) => y !== g)).filter((x) => x.length);
    onChange([...without, [g]]);
  };

  const tapGenre = (genre) => {
    if (connectMode) {
      if (genre !== connectMode) mergeInto(connectMode, genre);
      setConnectMode(null);
      return;
    }
    const grp = groups.find((g) => g.includes(genre));
    if (grp && grp.length === 1) removeGenre(genre); // tap a standalone pill → remove
  };

  const longPress = (genre) => {
    setConnectMode((c) => (c === genre ? null : genre));
  };

  const onDragStart = ({ active }) => { setActiveId(active.id); setConnectMode(null); };
  const onDragOver = ({ over }) => setOverId(over?.id ?? null);
  const onDragEnd = ({ active, over }) => {
    setActiveId(null);
    setOverId(null);
    if (!over) detach(active.id); // dropped on empty space → leave the group
    else if (over.id !== active.id) mergeInto(active.id, over.id);
  };

  const chipProps = { activeId, overId, connectMode, onTap: tapGenre, onRemove: removeGenre, onLongPress: longPress };

  return (
    <div>
      {groups.length > 0 && (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <div className="flex flex-wrap gap-2 mb-2" onClick={() => connectMode && setConnectMode(null)}>
            {groups.map((group, gi) =>
              group.length === 1 ? (
                <GenreChip key={group[0]} genre={group[0]} single {...chipProps} />
              ) : (
                <div key={`g${gi}`} className="inline-flex items-center rounded-xl bg-amber-400 overflow-hidden">
                  {group.map((g, i) => (
                    <Fragment key={g}>
                      {i > 0 && (
                        <span className="self-stretch flex items-center px-0.5" style={{ background: '#c97a10' }}>
                          <Link2 className="w-3 h-3 text-zinc-950/70" />
                        </span>
                      )}
                      <GenreChip genre={g} {...chipProps} />
                    </Fragment>
                  ))}
                  <button
                    type="button"
                    aria-label="Gruppe auflösen"
                    onClick={() => dissolve(gi)}
                    className="w-6 h-11 flex items-center justify-center text-zinc-950/70 active:bg-zinc-950/15"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ),
            )}
          </div>
          <DragOverlay>
            {activeId && (
              <span className="inline-flex items-center min-h-[44px] px-3 rounded-xl bg-amber-300 text-zinc-950 font-medium text-sm shadow-xl">
                {activeId}
              </span>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {connectMode && (
        <p className="text-xs text-amber-300 mb-2">Tippe ein weiteres Genre zum Verbinden — oder hier zum Abbrechen.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {unselected.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => addGenre(g)}
            style={{ opacity: connectMode || activeId ? 0.4 : 1 }}
            className="min-h-[44px] px-3 rounded-xl text-sm border bg-zinc-900 text-zinc-300 border-zinc-800 active:scale-95 transition-transform"
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}
