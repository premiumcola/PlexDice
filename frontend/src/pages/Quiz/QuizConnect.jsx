import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { OPTIONS_BLUR_NAME_BANDS, connectionKey } from './util';
import { renderRedactedPlot } from './redact';
import Fireworks from '../../components/Fireworks';
import { usePrefs } from '../../usePrefs';

const ACCENT = '#f5a623';
const GREEN = '#22c55e';
const RED = '#ef4444';

// Border by connection state (static class strings — Tailwind only sees literals). 'correct'/'wrong'
// only apply after Prüfen, on the player's own connected elements (M2).
const STATE_RING = {
  pending: 'ring-2 ring-[#f5a623]',
  linked: 'ring-2 ring-[#f5a623]/70',
  correct: 'ring-2 ring-[#22c55e]',
  wrong: 'ring-2 ring-[#ef4444]',
  idle: 'ring-1 ring-zinc-700',
};
const nodeColor = (state) => ({ correct: GREEN, wrong: RED, idle: '#52525b' }[state] || ACCENT);

const CHIP_H = 48; // approx thin-chip height used by the width fit
const ROW_GAP = 14; // approx column row gap
const W_MAX = 176; // cap element width so covers aren't oversized on tall/desktop viewports

// ONE element width for the whole board: the largest width where BOTH columns still fit the available
// height without page scroll (posters 1.5·W tall, portraits 1·W, chips ~CHIP_H), capped by the per-
// column width and W_MAX. Every cover AND chip then shares this width → tidy on desktop and mobile.
function useConnectWidth(leftItems, rightItems, ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const fitH = (items, H) => {
      const units = items.reduce((s, it) => s + (it.kind === 'text' ? 0 : it.aspect === '1/1' ? 1 : 1.5), 0);
      const chipsH = items.filter((it) => it.kind === 'text').length * CHIP_H;
      const avail = H - chipsH - Math.max(0, items.length - 1) * ROW_GAP;
      return units > 0 ? avail / units : Infinity;
    };
    const compute = () => {
      const el = ref.current;
      if (!el || !el.clientHeight || !el.clientWidth) return;
      const colMaxW = (el.clientWidth - 24) / 2; // two flex-1 columns minus the centre flex gap
      const next = Math.max(48, Math.floor(Math.min(W_MAX, colMaxW, fitH(leftItems, el.clientHeight), fitH(rightItems, el.clientHeight))));
      setW((p) => (Math.abs(p - next) < 1 ? p : next));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [leftItems, rightItems, ref]);
  return w;
}

// One connect item, sized by its column WIDTH (so chips and covers share one width): a film poster
// (2:3 → height 1.5·W), an actor portrait (1:1 → height W), or a thin text token chip. Posters/
// portraits keep aspect (object-cover, never distorted); actor-relation poster names are blurred.
function ConnectItem({ item, relation, state }) {
  const ring = STATE_RING[state] || STATE_RING.idle;
  if (item.kind === 'image') {
    const portrait = item.aspect === '1/1';
    const bands = !portrait && OPTIONS_BLUR_NAME_BANDS.has(relation);
    return (
      <div className={`relative w-full ${portrait ? 'aspect-square' : 'aspect-[2/3]'} rounded-xl overflow-hidden bg-zinc-800 ${ring}`}>
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
  // Thin token chip spans its column with centered text, so its inner edge (and node) sits on the
  // same rail as the posters' nodes while the chip itself looks centred, not jammed to one side.
  return (
    <div className={`w-full flex items-center justify-center rounded-xl bg-zinc-800 ${ring} px-3 py-2 text-center`}>
      <span className="text-sm sm:text-base font-semibold text-zinc-100 leading-tight line-clamp-2">{renderRedactedPlot(item.content)}</span>
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
  const leftItems = useMemo(() => left.map((id) => byId[id]), [left, byId]);
  const rightItems = useMemo(() => right.map((id) => byId[id]), [right, byId]);
  const { reduceMotion } = usePrefs();

  const containerRef = useRef(null);
  const colW = useConnectWidth(leftItems, rightItems, containerRef);
  const nodeEls = useRef({});
  const dragRef = useRef(null);
  const [links, setLinks] = useState({}); // itemId -> partnerId (stored both directions)
  const [pending, setPending] = useState(null);
  const [nodePos, setNodePos] = useState({});
  const [dragPos, setDragPos] = useState(null); // live drag endpoint in container coords

  const sameColumn = (a, b) => leftSet.has(a) === leftSet.has(b);
  // A connection is valid ONLY between an A item (subject) and a B item (answer), across columns —
  // never A↔A / B↔B / same-type / same-column. Wrong-but-valid guesses (film ↔ wrong attribute) stay.
  const canConnect = (a, b) => a !== b && !sameColumn(a, b) && byId[a]?.side !== byId[b]?.side;
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
  }, [question, colW]);

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
    } else if (canConnect(pending, id)) {
      connect(pending, id);
      setPending(null);
    } else {
      setPending(id); // invalid target (same column or same side) → switch the selection instead
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
    if (target && canConnect(d.fromId, target)) connect(d.fromId, target);
  };

  // De-duplicated connections (one entry per pair).
  const connections = [];
  Object.keys(links).forEach((id) => { if (id < links[id]) connections.push({ a: id, b: links[id] }); });
  const pathColor = (a, b) => (locked ? (correctKeys.has(connectionKey(a, b)) ? GREEN : RED) : ACCENT);
  // All pairs correct after Prüfen → celebrate (green nodes + borders come from itemState/M2).
  const allCorrect = locked && connections.length === total && connections.every(({ a, b }) => correctKeys.has(connectionKey(a, b)));
  const dInstr = (pa, pb) => {
    const dx = Math.max(24, Math.abs(pb.x - pa.x) * 0.4) * (pb.x >= pa.x ? 1 : -1);
    return `M ${pa.x} ${pa.y} C ${pa.x + dx} ${pa.y}, ${pb.x - dx} ${pb.y}, ${pb.x} ${pb.y}`;
  };

  // Connection state of an item drives its border + node colour. After Prüfen (locked), BOTH elements
  // of the player's own connection turn green (correct) or red (wrong) — only the player's links are
  // coloured, the correct solution is never revealed.
  const itemState = (id) => {
    if (links[id] === undefined) return pending === id ? 'pending' : 'idle';
    if (locked) return correctKeys.has(connectionKey(id, links[id])) ? 'correct' : 'wrong';
    return 'linked';
  };

  // A full-height column flush to the container's OUTER wall (left col → left, right col → right);
  // its items are sized to colW so covers and chips share ONE width. The node is anchored ON each
  // item's inner edge → all of a column's nodes sit on one vertical rail facing the centre gap.
  const Column = ({ ids, side }) => (
    <div className={`flex-1 min-w-0 h-full flex flex-col justify-center gap-2 sm:gap-3 ${side === 'left' ? 'items-start' : 'items-end'}`}>
      {ids.map((id) => {
        const item = byId[id];
        const state = itemState(id);
        return (
          <div
            key={id}
            data-item={id}
            role="button"
            tabIndex={0}
            aria-label="Verbinden"
            onPointerDown={(e) => onDown(id, e)}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(id, e)}
            style={{ width: colW || undefined }}
            className="relative max-w-full touch-none select-none cursor-pointer active:opacity-90"
          >
            <ConnectItem item={item} relation={question.relation} state={state} />
            <span
              ref={setNodeRef(id)}
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full ring-2 ring-zinc-950 z-10 pointer-events-none"
              style={{ [side === 'left' ? 'right' : 'left']: '-6px', background: nodeColor(state) }}
              aria-hidden="true"
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {allCorrect && !reduceMotion && <Fireworks variant="bursts" />}
      {/* Centred, max-width board: two full-height columns flush to the outer walls with the connection
          gap between them. Items are sized to colW (height-bound, capped at W_MAX) and hug the outer
          edge, so the board neither sprawls on a wide desktop nor collapses to a narrow centre strip,
          and it fills the width on mobile. */}
      <div ref={containerRef} className="relative flex-1 min-h-0 w-full max-w-xl mx-auto flex items-stretch gap-3 sm:gap-6">
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
