import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_SOFT, F, FPS } from '../brand/tokens';

const soft = Easing.bezier(...EASE_SOFT);

/** `[ e ] excerpt`, set as apps/editor/src/views/Wordmark.tsx sets it. */
export function Wordmark({ size = 40, color = C.ink }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.42em', fontFamily: F.sans, fontSize: size, color, lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 600, letterSpacing: '-0.133em', paddingRight: '0.133em' }}>[ e ]</span>
      <span style={{ fontSize: '1.05em', fontWeight: 600, letterSpacing: '-0.045em' }}>excerpt</span>
    </span>
  );
}

/** The site's `.lp-rise`: each element arrives on its own beat, rising a little. */
export function Rise({ at = 0, children, distance = 18, style }: { at?: number; children: ReactNode; distance?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame - at, [0, 0.7 * FPS], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: soft });
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * distance}px)` }}>{children}</div>;
}

/** Mono capitals, wide tracking: chrome speaks in the credits' voice. */
export function Label({ children, color = C.faint, size = 20, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return <span style={{ fontFamily: F.mono, fontSize: size, letterSpacing: '0.15em', textTransform: 'uppercase', color, ...style }}>{children}</span>;
}

/** The projector beam from the landing hero, with its slow, uneven flicker. */
export function Beam({ strength = 1 }: { strength?: number }) {
  const frame = useCurrentFrame();
  const t = (frame / FPS) % 7;
  const flicker = t < 0.84 ? 1 : t < 0.98 ? 0.86 : t < 3.29 ? 1 : t < 3.43 ? 0.92 : t < 4.97 ? 1 : t < 5.04 ? 0.82 : 1;
  const on = interpolate(frame, [0, 1.2 * FPS], [0, 1], { extrapolateRight: 'clamp', easing: soft });
  return (
    <AbsoluteFill style={{
      opacity: on * flicker * strength, pointerEvents: 'none', filter: 'blur(14px)',
      background: `conic-gradient(from 0deg at 50% -8%, transparent 0 158deg, rgba(241,240,221,.07) 168deg, ${C.beam} 180deg, rgba(241,240,221,.07) 192deg, transparent 202deg 360deg)`,
      WebkitMaskImage: 'linear-gradient(180deg, #000 18%, transparent 92%)',
      maskImage: 'linear-gradient(180deg, #000 18%, transparent 92%)',
    }} />
  );
}

/** Grain: felt, never seen. Re-seeded each frame so it moves like film. */
export function Grain({ opacity = 0.05 }: { opacity?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width="100%" height="100%">
        <filter id={`g${frame % 6}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={frame % 6} /></filter>
        <rect width="100%" height="100%" filter={`url(#g${frame % 6})`} />
      </svg>
    </AbsoluteFill>
  );
}

export function Vignette() {
  return <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(120% 100% at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)' }} />;
}

/**
 * Motif 3: four corner brackets round the active thing, drawn in from the corners.
 * Positioned by the caller (absolute box); `at` is the frame they start drawing.
 */
export function Brackets({ at = 0, size = 22, weight = 3, color = C.ember, inset = 0 }: { at?: number; size?: number; weight?: number; color?: string; inset?: number }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame - at, [0, 0.45 * FPS], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: soft });
  const len = size * p;
  const pull = (1 - p) * 18;
  const corner = (v: 'top' | 'bottom', h: 'left' | 'right'): CSSProperties => ({
    position: 'absolute', [v]: inset - pull, [h]: inset - pull, width: len, height: len, opacity: p,
    [`border${v === 'top' ? 'Top' : 'Bottom'}`]: `${weight}px solid ${color}`,
    [`border${h === 'left' ? 'Left' : 'Right'}`]: `${weight}px solid ${color}`,
  });
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <i style={corner('top', 'left')} /><i style={corner('top', 'right')} />
      <i style={corner('bottom', 'left')} /><i style={corner('bottom', 'right')} />
    </div>
  );
}

/** Fades a whole scene in and out at its edges, so cuts breathe. */
export function SceneFade({ duration, children, edge = 10 }: { duration: number; children: ReactNode; edge?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, edge, duration - edge, duration], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}
