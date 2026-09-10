import { splitIntoSubtitleLines } from '@excerpt/core';

export interface Spoken { text: string; at: number; label: string; final?: boolean }

/**
 * A generic video-call frame. Deliberately not a replica of any product's UI —
 * it exists to make the captions legible as "this is what your meeting looks
 * like", not to imitate somebody's branding.
 *
 * Tiles are labelled by person; captions are labelled by ROLE. That mismatch is
 * the truth: two audio streams tell Excerpt who spoke, never who they are.
 */
export function CallFrame({ fresh, elapsed, bare = false }:
  { fresh: Spoken[]; elapsed: number; bare?: boolean }) {
  const speaking = new Set(fresh.map((f) => f.label));

  return (
    <div className="call">
      {!bare && <div className="tiles">
        <Tile name="Client" role="SPEAKER" live={speaking.has('SPEAKER')} />
        <Tile name="You" role="YOU" live={speaking.has('YOU')} />
      </div>}

      <Captions fresh={fresh} />

      {!bare && <div className="call-chrome">
        <span className="rec demo-label">Scripted demo</span>
        <span className="elapsed">{stamp(elapsed)}</span>
      </div>}
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
  const visible = fresh.slice(-2);
  const overlapping = visible.length > 1;
  const finalAnnouncement = visible.filter((s) => s.final).map((s) => s.text).join(' ');
  return (
    <div
      className={standalone ? 'caption standalone' : 'caption'}
      role="region"
      aria-label="Live captions"
    >
      <div className="fade">
        {!overlapping && visible[0] && <div className="who">{visible[0].label}</div>}
        {visible.flatMap((s, i) => {
          const lines = splitIntoSubtitleLines(s.text, { maxChars: overlapping ? 40 : 42 });
          return overlapping
            ? [<div className="line" key={i}>– {lines.at(-1)}</div>]
            : lines.slice(-2).map((l, j) => <div className="line" key={`${i}-${j}`}>{l}</div>);
        })}
      </div>
      <span className="sr-only" aria-live="polite">{finalAnnouncement}</span>
    </div>
  );
}

function Tile({ name, role, live }: { name: string; role: string; live: boolean }) {
  return (
    <div className={`tile${live ? ' live' : ''}`}>
      <div className="avatar"><Silhouette /></div>
      <div className="nameplate">
        {name}
        {/* The tile knows who somebody is; Excerpt only knows who spoke. Show the
            role only where it differs, so "You YOU" does not read as a stutter. */}
        {role !== name.toUpperCase() && <span className="role">{role}</span>}
      </div>
    </div>
  );
}

/**
 * The generic participant: a head and shoulders, the convention every product uses
 * for somebody whose picture it does not have.
 *
 * It replaced an initial taken from the tile's name, which quietly claimed more than
 * Excerpt knows. Two audio streams tell it who *spoke* — never who they are — so a
 * letter standing for a person was the interface asserting an identity the product
 * cannot see. A silhouette says "a participant", which is exactly true.
 *
 * Drawn rather than a font glyph or an emoji so it keeps its weight against the
 * frame at any size, and inherits colour from the tile's live state.
 */
function Silhouette() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden focusable="false">
      <circle cx="24" cy="18" r="8.4" fill="currentColor" />
      {/* The shoulders run off the bottom of the frame and the round avatar clips
          them, which is what makes the figure sit *in* the circle rather than float
          inside it. Drawing them to fit would leave the gap the first pass had. */}
      <path d="M7.5 49a16.5 16.5 0 0 1 33 0Z" fill="currentColor" />
    </svg>
  );
}

const stamp = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
