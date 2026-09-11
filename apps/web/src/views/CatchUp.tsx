import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { TranscriptEvent } from '@excerpt/types';
import { toTurns } from '@excerpt/core';
import './catch-up.css';

type Position = { x: number; y: number };
const POSITION_KEY = 'excerpt.catch-up.position';
const stamp = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const at = (event: TranscriptEvent) => event.tStart !== undefined ? event.tStart * 1000 : event.tArrived;
const revisionOf = (events: TranscriptEvent[]) => events.map((event) => `${event.id}:${event.isFinal ? 'f' : event.text}`).join('|');
const clamp = (position: Position, width = 460, height = 440): Position => ({
  x: Math.max(12, Math.min(position.x, window.innerWidth - width - 12)),
  y: Math.max(12, Math.min(position.y, window.innerHeight - height - 12)),
});
const initialPosition = (): Position => {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return clamp(saved);
  } catch { /* Storage is optional. */ }
  return clamp({ x: window.innerWidth - 484, y: window.innerHeight - 536 });
};

export function CatchUp({ events, now, onClose, floating = true, onImages, imageMessage = '' }: {
  events: TranscriptEvent[]; now: number; onClose: () => void; floating?: boolean;
  onImages?: (files: File[], origin?: 'drop' | 'paste' | 'import') => void; imageMessage?: string;
}) {
  const [seconds, setSeconds] = useState(60);
  const [seen, setSeen] = useState(() => revisionOf(events));
  const [position, setPosition] = useState(initialPosition);
  const [draggingImage, setDraggingImage] = useState(false);
  const [notice, setNotice] = useState('');
  const dragDepth = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const rows = useRef<Record<string, HTMLSpanElement | null>>({});
  const latest = useRef({ events, now }); latest.current = { events, now };
  const drag = useRef<{ x: number; y: number; start: Position } | null>(null);
  const turns = toTurns(events);
  const revision = revisionOf(events);
  const unread = revision !== seen;
  const place = (next: Position) => {
    const bounds = panel.current?.getBoundingClientRect();
    const safe = clamp(next, bounds?.width, bounds?.height);
    setPosition(safe);
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(safe)); } catch { /* Still movable. */ }
  };
  const jumpTo = (id?: string) => {
    const row = id ? rows.current[id] : undefined;
    const container = viewport.current;
    if (!row || !container) return;
    container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top - 40;
  };
  const markVisible = () => {
    const container = viewport.current;
    if (container && container.scrollHeight - container.scrollTop - container.clientHeight < 24) setSeen(revisionOf(latest.current.events));
  };
  useLayoutEffect(() => {
    const { events, now } = latest.current;
    const target = events.find((event) => at(event) >= now - seconds * 1000) ?? events.at(-1);
    jumpTo(target?.id);
  }, [seconds]);
  // Appending text never moves the viewport. Mark it read only if it is actually visible.
  useLayoutEffect(markVisible, [revision]);
  useEffect(() => {
    const owner = panel.current?.ownerDocument;
    const previous = owner?.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (!floating) return;
    const resize = () => setPosition((current) => clamp(current, panel.current?.offsetWidth, panel.current?.offsetHeight));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [floating]);
  useEffect(() => {
    if (!imageMessage) return;
    setNotice(imageMessage);
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [imageMessage]);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!floating || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    drag.current = { x: event.clientX, y: event.clientY, start: position };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return <section ref={panel} tabIndex={-1} role="dialog" aria-label="Catch up" className={`catch-up-window ${floating ? 'floating' : 'embedded'}`}
    style={floating ? { left: position.x, top: position.y } as CSSProperties : undefined}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
    onDragEnter={(event) => { if (onImages && event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth.current++; setDraggingImage(true); } }}
    onDragOver={(event) => { if (onImages && event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
    onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDraggingImage(false); }}
    onDrop={(event) => { if (!onImages || !event.dataTransfer.files.length) return; event.preventDefault(); dragDepth.current = 0; setDraggingImage(false); onImages(Array.from(event.dataTransfer.files), 'drop'); }}>
    <header className="catch-up-header">
      <div className="catch-up-drag" tabIndex={floating ? 0 : -1} role={floating ? 'button' : undefined}
        aria-label={floating ? 'Move catch-up panel. Drag or use arrow keys.' : undefined}
        onPointerDown={startDrag}
        onPointerMove={(event) => { if (drag.current) place({ x: drag.current.start.x + event.clientX - drag.current.x, y: drag.current.start.y + event.clientY - drag.current.y }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(event) => { const offsets: Record<string, Position> = { ArrowLeft: { x: -20, y: 0 }, ArrowRight: { x: 20, y: 0 }, ArrowUp: { x: 0, y: -20 }, ArrowDown: { x: 0, y: 20 } }; const delta = offsets[event.key]; if (floating && delta) { event.preventDefault(); place({ x: position.x + delta.x, y: position.y + delta.y }); } }}>
        <span className="catch-up-mark" aria-hidden="true">[ e ]</span><h2>Catch up</h2>
      </div>
      <div className="catch-up-range" role="group" aria-label="Look back">{[30, 60, 90].map((value) => <button key={value} aria-pressed={seconds === value} onClick={() => setSeconds(value)}>{value}s</button>)}</div>
      <button className="catch-up-close" aria-label="Close catch up and return to live" onClick={onClose}>×</button>
    </header>
    <div ref={viewport} tabIndex={0} className="catch-up-transcript" aria-label="Recent conversation" onScroll={markVisible}>
      {!turns.length && <div className="catch-up-empty"><p>Waiting for the conversation.</p><span>Words will appear here as they arrive.</span></div>}
      {turns.map((turn) => <article className={`catch-up-turn ${turn.role}`} key={turn.id}>
        <div className="catch-up-speaker"><span>{turn.role === 'you' ? 'You' : turn.speakerLabel === 'SPEAKER' ? 'Others' : turn.speakerLabel}</span><time>{stamp(at(turn.events[0]!))}</time></div>
        <p>{turn.events.map((event, index) => <span className={event.isFinal ? '' : 'provisional'} key={event.id} ref={(row) => { rows.current[event.id] = row; }}>{index > 0 ? ' ' : ''}{event.text}{!event.isFinal && <small> live</small>}</span>)}</p>
      </article>)}
    </div>
    <footer className="catch-up-footer">
      <div className="catch-up-status" role="status">{notice || (unread ? <button className="catch-up-new" onClick={() => { const container = viewport.current; if (container) container.scrollTop = container.scrollHeight; setSeen(revision); }}>New conversation below ↓</button> : <span>Conversation continues live</span>)}</div>
      <button className="catch-up-return" onClick={onClose}>Return to live <kbd>Esc</kbd></button>
    </footer>
    {draggingImage && <div className="catch-up-drop"><span>＋</span><strong>Drop image into this meeting</strong><small>Saved beside the conversation at this moment.</small></div>}
  </section>;
}
