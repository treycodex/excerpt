import type { ReactNode } from 'react';
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE_CINE, F, FPS, H, W } from '../brand/tokens';
import { GLIDE } from './Kinetic';
import { Brackets } from './primitives';

/** The Mac's screen in points; the recordings are 2× (3420 × 2224). */
export const SCREEN = { w: 1710, h: 1112 } as const;
/** A piece of a take: source seconds [from, to), played at `rate`. */
export type Clip = { from: number; to: number; rate?: number };

/** Where source time `s` lands in the scene, or null if it was cut. */
export function sceneTime(clips: Clip[], s: number): number | null {
  let start = 0;
  for (const c of clips) {
    const rate = c.rate ?? 1;
    if (s >= c.from && s < c.to) return start + (s - c.from) / rate;
    start += (c.to - c.from) / rate;
  }
  return null;
}
/** The picture fills the frame: the stamps carry the narration, there is no subtitle band. */
export const VIEW = { x: 0, y: 0, w: W, h: H } as const;

export type Rect = [x: number, y: number, w: number, h: number];
export type CameraKey = { at: number; rect: Rect };
export type Click = { at: number; x: number; y: number };
export type Highlight = { at: number; to: number; rect: Rect; label?: string };

const FULL: Rect = [0, 0, SCREEN.w, SCREEN.h];
const cine = Easing.bezier(...EASE_CINE);

/**
 * The camera at time t: springs from key to key (a firm move that settles, not a
 * slow ease), always pushing in a little so no shot sits still, and punching in
 * briefly on each beat (a click, a keystroke).
 */
function cameraAt(keys: CameraKey[], t: number, beats: number[]): Rect {
  const all = keys.length ? keys : [{ at: 0, rect: FULL }];
  let rect = all[0]!.rect;
  for (const key of all.slice(1)) {
    if (t < key.at) break;
    const p = spring({ frame: (t - key.at) * FPS, fps: FPS, config: GLIDE });
    rect = rect.map((v, i) => v + (key.rect[i]! - v) * p) as Rect;
  }
  const push = 1 + Math.min(0.07, t * 0.011);
  const punch = beats.reduce((z, b) => z + interpolate(t - b, [0, 0.1, 0.5], [0, 0.045, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), 0);
  const z = push * (1 + punch);
  const [x, y, w, h] = rect;
  return [x + (w - w / z) / 2, y + (h - h / z) / 2, w / z, h / z];
}

/**
 * Real screen footage under a moving camera (Screen Studio style): the camera frames
 * a rectangle of the screen, in points, and eases between framings. Everything drawn
 * in screen space (cursor, brackets) rides the same transform, so it stays pinned to
 * the app underneath.
 */
export function Footage({ shot, file, screen = SCREEN, clips, camera = [], clicks = [], beats = [], highlights = [], pending, chrome, focus, children }: {
  shot: string; file?: string | undefined; screen?: { w: number; h: number } | undefined; clips?: Clip[] | undefined;
  camera?: CameraKey[] | undefined; clicks?: Click[] | undefined; beats?: number[] | undefined; highlights?: Highlight[] | undefined;
  pending?: boolean | undefined; chrome?: boolean | undefined; focus?: Rect | undefined; children?: ReactNode;
}) {
  const SCREEN = screen;
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cuts = clips ?? [{ from: 0, to: 9999 }];
  // Logged clicks are in source time; place them on the scene's timeline.
  const placed = clicks.flatMap((c) => { const at = sceneTime(cuts, c.at); return at === null ? [] : [{ ...c, at }]; });
  const hits = [...placed.map((c) => c.at), ...beats.flatMap((b) => { const at = sceneTime(cuts, b); return at === null ? [] : [at]; })];
  const [cx, cy, cw, ch] = cameraAt(camera.length ? camera : [{ at: 0, rect: [0, 0, SCREEN.w, SCREEN.h] }], t, hits);
  const scale = Math.min(VIEW.w / cw, VIEW.h / ch);
  const left = VIEW.x + VIEW.w / 2 - (cx + cw / 2) * scale;
  const top = VIEW.h / 2 - (cy + ch / 2) * scale;
  // Rounded like a window only when the whole screen is in shot.
  const radius = interpolate(scale, [VIEW.h / SCREEN.h, VIEW.h / SCREEN.h * 1.4], [18, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left, top, width: SCREEN.w * scale, height: SCREEN.h * scale,
        borderRadius: radius, overflow: 'hidden', background: C.paper,
        boxShadow: `0 0 0 1px ${C.edge}, 0 40px 120px -40px rgba(0,0,0,.8)`,
      }}>
        {pending
          ? <Pending shot={shot} />
          : cuts.map((c, i) => {
            const rate = c.rate ?? 1;
            const start = cuts.slice(0, i).reduce((sum, p) => sum + (p.to - p.from) / (p.rate ?? 1), 0);
            return (
              <Sequence key={i} from={Math.round(start * FPS)} durationInFrames={Math.max(1, Math.round((c.to - c.from) / rate * FPS))} layout="none">
                <OffthreadVideo src={staticFile(`footage/${file ?? `${shot}.mov`}`)} startFrom={Math.round(c.from * FPS)} playbackRate={rate} muted
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
              </Sequence>
            );
          })}
        <div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN.w, height: SCREEN.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {highlights.filter((h) => t >= h.at && t < h.to).map((h, i) => (
            <div key={i} style={{ position: 'absolute', left: h.rect[0], top: h.rect[1], width: h.rect[2], height: h.rect[3] }}>
              <Brackets at={Math.round(h.at * FPS)} size={14 / Math.max(1, scale / 1.2)} weight={2.2 / Math.max(1, scale / 1.4)} inset={-8} />
            </div>
          ))}
          {chrome && <WindowLights />}
          {focus && (
            // A spotlight on the window being shown: the rest of the desktop falls back.
            <div style={{ position: 'absolute', left: focus[0], top: focus[1], width: focus[2], height: focus[3], borderRadius: 12,
              boxShadow: '0 0 0 4000px rgba(10,11,9,.78)' }} />
          )}
          <Cursor clicks={placed} t={t} scale={scale} />
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** The stage renders the editor without a title bar; draw the window's own lights. */
function WindowLights() {
  return (
    <div style={{ position: 'absolute', left: 18, top: 17, display: 'flex', gap: 8 }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => <i key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c, boxShadow: 'inset 0 0 0 .5px rgba(0,0,0,.18)' }} />)}
    </div>
  );
}

function Pending({ shot }: { shot: string }) {
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: '#e9e8d4', fontFamily: F.mono, color: '#565B4C', fontSize: 28, letterSpacing: '0.15em' }}>
      FOOTAGE · {shot.toUpperCase()}
    </AbsoluteFill>
  );
}

/**
 * The drawn cursor. It glides to each logged click (arriving on time), presses, and
 * rings in ember. Before the first click it waits beside it; the automation's own
 * cursor, which teleports, is never recorded.
 */
function Cursor({ clicks, t, scale }: { clicks: Click[]; t: number; scale: number }) {
  if (!clicks.length) return null;
  const glide = 0.7;
  let x = clicks[0]!.x + 60, y = clicks[0]!.y + 70;
  let ring: { x: number; y: number; age: number } | null = null;
  for (let i = 0; i < clicks.length; i++) {
    const c = clicks[i]!;
    const start = c.at - glide;
    if (t < start) break;
    const p = interpolate(t, [start, c.at], [0, 1], { extrapolateRight: 'clamp', easing: cine });
    x = x + (c.x - x) * p; y = y + (c.y - y) * p;
    if (t >= c.at) ring = { x: c.x, y: c.y, age: t - c.at };
  }
  const size = 26 / Math.max(1, scale * 0.9);
  const press = ring && ring.age < 0.12 ? 0.86 : 1;
  return (
    <>
      {ring && ring.age < 0.6 && (
        <div style={{
          position: 'absolute', left: ring.x, top: ring.y, width: 0, height: 0,
          boxShadow: `0 0 0 ${(4 + ring.age * 60) / scale}px rgba(255,77,15,${0.55 * (1 - ring.age / 0.6)})`, borderRadius: '50%',
        }} />
      )}
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ position: 'absolute', left: x - size * 0.18, top: y - size * 0.1, transform: `scale(${press})`, transformOrigin: '20% 10%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }}>
        <path d="M4.5 2.5 19 13.2l-6.6.9 3.8 7.2-2.6 1.3-3.8-7.3L4.5 20z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </>
  );
}
