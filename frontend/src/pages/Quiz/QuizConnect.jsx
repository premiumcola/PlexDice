import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { OPTIONS_BLUR_NAME_BANDS, connectionKey } from './util';
import { renderRedactedPlot } from './redact';

const ACCENT = '#f5a623';
const GREEN = '#22c55e';
const RED = '#ef4444';

// One connect item rendered to fill its row height: a film poster (2:3), an actor portrait (1:1
// rounded) or a short text token (chip). Posters/portraits keep their aspect (object-cover, never
// distorted). For actor relations the printed names along the poster edges are blurred.
function ConnectItem({ item, relation, state }) {
  // Static class strings — Tailwind only generates classes it sees literally in the source.
  const ring =
    state === 'pending' ? 'ring-2 ring-[#f5a623]'
      : state === 'linked' ? 'ring-2 ring-[#f5a623]/70'
        : 'ring-1 ring-zinc-700';
  if (item.kind === 'image') {
    const portrait = item.aspect === '1/1';
    const bands = !portrait && OPTIONS_BLUR_NAME_BANDS.has(relation);
    return (
      <div className={`relative h-full ${portrait ? 'aspect-square' : 'aspect-[2/3]'} rounded-xl overflow-hidden bg-zinc-800 ${ring}`}>
        {item.content ? (
          <img src={item.content} alt="" draggable="false" className={`absolute inset-0 w-full h-full object-cover ${portrait ? 'object-top' : 'object-center'}`} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><User className="w-1/3 h-1/3 text-zinc-600" /></div>
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
    <div className={`h-full max-w-full flex items-center justify-center rounded-xl bg-zinc-800 ${ring} px-3 py-1.5 text-center`}>
      <span className="text-sm sm:text-base font-semibold text-zinc-100 leading-tight line-clamp-3">{renderRedactedPlot(item.content)}</span>
    </div>
  );
}

// "Verbinden" connect round: two balanced columns of mixed item types. Link left<->right by
// tap-then-tap OR drag (both directions); the open connection draws as an accent SVG path with node
// dots. Re-linking an item overwrites its old link; tapping a connected item (or its line) removes
// it. Submit ("Prüfen") + green/red validation arrive in G3.
export default function QuizConnect({ question, locked, onSubmit }) {
  const byId = useMemo(() => Object.fromEntries(question.items.map((it) => [it.id, it])), [question]);
  const { left, right } = question.columns;
  const leftSet = useMemo(() => new Set(left), [left]);
  const correctKeys = useMemo(() => new Set(question.pairs.map((p) => connectionKey(p.left, p.right))), [question]);

  const containerRef = useRef(null);
  const nodeEls = useRef({});
  const dragRef = useRef(null);
  const [links, setLinks] = useState({}); // itemId -> partnerId (stored both directions)
  const [pending, setPending] = useState(null);
  const [nodePos, setNodePos] = useState({});
  const [dragPos, setDragPos] = useState(null); // live drag endpoint in container coords

  const sameColumn = (a, b) => leftSet.has(a) === leftSet.has(b);
  const linkCount = Object.keys(links).length / 2;
  const total = left.length;

  const setNodeRef = (id) => (el) => { if (el) nodeEls.current[id] = el; };

  // Measure each connection node's centre relative to the container; re-fit on resize / new round.
  useLayoutEffect(() => {
    const measure = () => {
      const cont = containerRef.current;
      if (!cont) return;
      const cr = cont.getBoundingClientRect();
      const pos = {};
      Object.entries(nodeEls.current).forEach(([id, el]) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        pos[id] = { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top };
      });
      setNodePos(pos);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [question]);

  // New round → clear all links.
  useEffect(() => { setLinks({}); setPending(null); setDragPos(null); }, [question]);

  const connect = (a, b) => setLinks((prev) => {
    const next = { ...prev };
    [a, b].forEach((id) => { if (next[id] !== undefined) { delete next[next[id]]; delete next[id]; } });
    next[a] = b;
    next[b] = a;
    return next;
  });
  const removeLink = (id) => setLinks((prev) => {
    if (prev[id] === undefined) return prev;
    const next = { ...prev };
    delete next[next[id]];
    delete next[id];
    return next;
  });

  const handleTap = (id) => {
    if (locked) return;
    if (pending === null) {
      if (links[id] !== undefined) removeLink(id); // tap a connected item → undo
      else setPending(id);
    } else if (pending === id) {
      setPending(null);
    } else if (sameColumn(pending, id)) {
      setPending(id);
    } else {
      connect(pending, id);
      setPending(null);
    }
  };

  const itemUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.closest('[data-item]') ? el.closest('[data-item]').getAttribute('data-item') : null;
  };
  const toLocal = (e) => {
    const cr = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - cr.left, y: e.clientY - cr.top };
  };

  const onDown = (id, e) => {
    if (locked) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { fromId: id, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.moved = true;
    if (d.moved) setDragPos({ fromId: d.fromId, ...toLocal(e) });
  };
  const onUp = (id, e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragPos(null);
    if (!d) return;
    if (!d.moved) { handleTap(id); return; }
    const target = itemUnder(e.clientX, e.clientY);
    if (target && target !== d.fromId && !sameColumn(d.fromId, target)) connect(d.fromId, target);
  };

  // De-duplicated connections (one entry per pair).
  const connections = [];
  Object.keys(links).forEach((id) => { if (id < links[id]) connections.push({ a: id, b: links[id] }); });
  const pathColor = (a, b) => (locked ? (correctKeys.has(connectionKey(a, b)) ? GREEN : RED) : ACCENT);
  const dInstr = (pa, pb) => {
    const dx = Math.max(24, Math.abs(pb.x - pa.x) * 0.4) * (pb.x >= pa.x ? 1 : -1);
    return `M ${pa.x} ${pa.y} C ${pa.x + dx} ${pa.y}, ${pb.x - dx} ${pb.y}, ${pb.x} ${pb.y}`;
  };

  const Column = ({ ids, side }) => (
    <div className="flex-1 min-w-0 h-full flex flex-col gap-2 sm:gap-3">
      {ids.map((id) => {
        const state = pending === id ? 'pending' : links[id] !== undefined ? 'linked' : 'idle';
        return (
          <div key={id} className={`flex-1 min-h-0 flex items-center gap-1.5 ${side === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
            <div
              data-item={id}
              role="button"
              tabIndex={0}
              aria-label="Verbinden"
              onPointerDown={(e) => onDown(id, e)}
              onPointerMove={onMove}
              onPointerUp={(e) => onUp(id, e)}
              className="h-full flex items-center min-w-0 max-w-full touch-none select-none cursor-pointer active:opacity-90"
            >
              <ConnectItem item={byId[id]} relation={question.relation} state={state} />
            </div>
            <span
              ref={setNodeRef(id)}
              className={`shrink-0 w-3 h-3 rounded-full ring-2 ring-zinc-900 ${state === 'idle' ? 'bg-zinc-600' : ''}`}
              style={state !== 'idle' ? { background: ACCENT } : undefined}
              aria-hidden="true"
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div ref={containerRef} className="relative flex-1 min-h-0 flex items-stretch gap-3 sm:gap-6">
        <Column ids={left} side="left" />
        <Column ids={right} side="right" />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          {connections.map(({ a, b }) => {
            const pa = nodePos[a];
            const pb = nodePos[b];
            if (!pa || !pb) return null;
            const d = dInstr(pa, pb);
            return (
              <g key={connectionKey(a, b)}>
                <path d={d} stroke={pathColor(a, b)} strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d={d} stroke="transparent" strokeWidth="22" fill="none" className="pointer-events-auto cursor-pointer" onClick={() => !locked && removeLink(a)} />
              </g>
            );
          })}
          {dragPos && nodePos[dragPos.fromId] && (
            <path d={`M ${nodePos[dragPos.fromId].x} ${nodePos[dragPos.fromId].y} L ${dragPos.x} ${dragPos.y}`} stroke={ACCENT} strokeWidth="3" strokeDasharray="6 6" fill="none" strokeLinecap="round" />
          )}
        </svg>
      </div>
      <button
        type="button"
        disabled={locked || linkCount < total}
        onClick={() => onSubmit && onSubmit(connections.map(({ a, b }) => connectionKey(a, b)))}
        className={`shrink-0 mt-3 w-full rounded-xl py-3 font-semibold transition-colors ${linkCount >= total && !locked ? 'bg-[#f5a623] text-zinc-950 active:scale-[0.98]' : 'bg-zinc-800 text-zinc-500 disabled:cursor-not-allowed'}`}
      >
        Prüfen ({linkCount} / {total})
      </button>
    </div>
  );
}
