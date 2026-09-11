import { useMemo, useRef } from 'react';

export interface StripMark {
  id: string;
  /** ms from meeting start. Approximate, like every timing in Excerpt. */
  at: number;
  /** Only settled items wear the accent. */
  settled?: boolean;
  label?: string;
  kind?: 'item' | 'image';
}

export interface StripProps {
  duration: number;
  position?: number | undefined;
  marks?: StripMark[];
  onScrub?: (ms: number) => void;
  onSelect?: (markId: string) => void;
  selectedId?: string;
}

/** Tick spacing that keeps a strip legible whether a meeting ran 40s or 90 minutes. */
function chooseTicks(duration: number): { minor: number; major: number } {
  const m = duration / 60_000;
  if (m <= 2) return { minor: 5_000, major: 30_000 };
  if (m <= 10) return { minor: 15_000, major: 60_000 };
  if (m <= 45) return { minor: 60_000, major: 300_000 };
  return { minor: 300_000, major: 900_000 };
}

const stamp = (ms: number) => {
  const t = Math.round(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Motif 2 — The Strip.
 *
 * The meeting as a film strip: fine ticks, numbered markers, one ember dot. Items
 * are marks on it, so clicking a note and scrubbing a timeline are the same gesture.
 *
 * Nothing plays. There is no audio — scrubbing moves through the transcript.
 */
export function Strip({ duration, position, marks = [], onScrub, onSelect, selectedId }: StripProps) {
  const rail = useRef<HTMLDivElement>(null);
  const { minor, major } = useMemo(() => chooseTicks(duration), [duration]);

  const ticks = useMemo(() => {
    const out: { at: number; major: boolean }[] = [];
    for (let t = 0; t <= duration; t += minor) out.push({ at: t, major: t % major === 0 });
    return out;
  }, [duration, minor, major]);

  const pct = (ms: number) => {
    if (!Number.isFinite(ms) || duration <= 0) return '0%';
    return `${Math.min(100, Math.max(0, (ms / duration) * 100))}%`;
  };

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onScrub || !rail.current) return;
    const box = rail.current.getBoundingClientRect();
    // A zero-width rail (initial layout, a collapsed pane, a resize to nothing)
    // would divide by zero and hand callers NaN.
    if (box.width <= 0) return;
    const ms = ((e.clientX - box.left) / box.width) * duration;
    if (Number.isFinite(ms)) onScrub(ms);
  };

  const keyScrub = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onScrub) return;
    const step = Math.max(1000, Math.min(15_000, duration / 20));
    const current = position ?? 0;
    let next: number | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = current + step;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = duration;
    if (next === undefined) return;
    e.preventDefault();
    onScrub(Math.max(0, Math.min(duration, next)));
  };

  return (
    <div className="strip">
      <div
        className="strip-rail" ref={rail} onClick={scrub} onKeyDown={keyScrub}
        tabIndex={onScrub ? 0 : undefined}
        role={onScrub ? 'slider' : undefined}
        aria-label={onScrub ? 'Approximate transcript position' : undefined}
        aria-valuemin={onScrub ? 0 : undefined}
        aria-valuemax={onScrub ? Math.round(duration / 1000) : undefined}
        aria-valuenow={onScrub ? Math.round((position ?? 0) / 1000) : undefined}
        aria-valuetext={onScrub ? `Approximately ${stamp(position ?? 0)}` : undefined}
      >
        {ticks.map((t) => (
          <i
            key={t.at}
            className={t.major ? 'tick major' : 'tick'}
            style={{ left: pct(t.at) }}
          />
        ))}

        {marks.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mark${m.settled ? ' settled' : ''}${m.kind === 'image' ? ' image' : ''}${selectedId === m.id ? ' selected' : ''}`}
            style={{ left: pct(m.at) }}
            title={m.label ?? ''}
            aria-label={`${m.label ?? (m.kind === 'image' ? 'Captured moment' : 'Moment')}, approximately ${stamp(m.at)}`}
            aria-pressed={selectedId === m.id}
            onClick={(e) => { e.stopPropagation(); onSelect?.(m.id); }}
          />
        ))}

        {position !== undefined && (
          <span className="playhead" style={{ left: pct(position) }} />
        )}
      </div>

      <div className="strip-labels">
        {ticks.filter((t) => t.major).map((t) => (
          <span key={t.at} style={{ left: pct(t.at) }}>{stamp(t.at)}</span>
        ))}
      </div>
    </div>
  );
}
