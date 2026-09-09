import { splitIntoSubtitleLines } from '@excerpt/core';

export interface Spoken { text: string; at: number; label: string }

/**
 * A generic video-call frame. Deliberately not a replica of any product's UI —
 * it exists to make the captions legible as "this is what your meeting looks
 * like", not to imitate somebody's branding.
 *
 * Tiles are labelled by person; captions are labelled by ROLE. That mismatch is
 * the truth: two audio streams tell Excerpt who spoke, never who they are.
 */
export function CallFrame({ fresh, elapsed }: { fresh: Spoken[]; elapsed: number }) {
  const speaking = new Set(fresh.map((f) => f.label));

  return (
    <div className="call">
      <div className="tiles">
        <Tile name="Client" role="SPEAKER" live={speaking.has('SPEAKER')} />
        <Tile name="You" role="YOU" live={speaking.has('YOU')} />
      </div>

      <Captions fresh={fresh} />

      <div className="call-chrome">
        <span className="rec"><i /> Excerpt is listening</span>
        <span className="elapsed">{stamp(elapsed)}</span>
      </div>
    </div>
  );
}

/**
 * The subtitle itself, so the same component renders inside the call and inside
 * the always-on-top PiP window.
 *
 * aria-live is polite and the region is labelled: a screen reader should hear the
 * caption settle, not every interim keystroke of it.
 */
export function Captions({ fresh, standalone }: { fresh: Spoken[]; standalone?: boolean }) {
  if (!fresh.length) return null;
  const overlapping = fresh.length > 1;
  return (
    <div
      className={standalone ? 'caption standalone' : 'caption'}
      key={fresh.map((f) => f.text).join('|')}
      role="region"
      aria-label="Live captions"
      aria-live="polite"
    >
      <div className="fade in">
        {!overlapping && fresh[0] && <div className="who">{fresh[0].label}</div>}
        {fresh.flatMap((s, i) => {
          const lines = splitIntoSubtitleLines(s.text, { maxChars: overlapping ? 40 : 42 });
          return overlapping
            ? [<div className="line" key={i}>– {lines.join(' ')}</div>]
            : lines.map((l, j) => <div className="line" key={`${i}-${j}`}>{l}</div>);
        })}
      </div>
    </div>
  );
}

function Tile({ name, role, live }: { name: string; role: string; live: boolean }) {
  return (
    <div className={`tile${live ? ' live' : ''}`}>
      <div className="initial">{name[0]}</div>
      <div className="nameplate">
        {name}
        {/* The tile knows who somebody is; Excerpt only knows who spoke. Show the
            role only where it differs, so "You YOU" does not read as a stutter. */}
        {role !== name.toUpperCase() && <span className="role">{role}</span>}
      </div>
    </div>
  );
}

const stamp = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
