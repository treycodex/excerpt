import type { CSSProperties } from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../brand/tokens';

/** A snappy spring with a touch of overshoot: type lands, it does not float in. */
export const SNAP = { damping: 14, stiffness: 190, mass: 0.7 } as const;
/** For camera moves: firm, settles fast, barely overshoots. */
export const GLIDE = { damping: 20, stiffness: 110, mass: 0.9 } as const;

export function useSpringAt(at: number, config: { damping: number; stiffness: number; mass: number } = SNAP) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config });
}

/**
 * A line set word by word: each word rises out of a blur on its own beat. The last
 * `turn` words switch to the serif, the landing page's headline shape.
 */
export function Kinetic({ text, turn, at = 0, size = 120, stagger = 2.2, color = C.ink, align = 'center', weight = 480, exitAt, style }: {
  text: string; turn?: string | undefined; at?: number; size?: number; stagger?: number; color?: string;
  align?: 'center' | 'left'; weight?: number; exitAt?: number | undefined; style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ').filter(Boolean).map((w) => ({ w, serif: false }));
  const turned = (turn ?? '').split(' ').filter(Boolean).map((w) => ({ w, serif: true }));
  const all = [...words, ...turned];
  const out = exitAt === undefined ? 0 : spring({ frame: frame - exitAt, fps, config: SNAP });
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start',
      columnGap: '0.24em', rowGap: '0.02em', fontFamily: F.sans, fontSize: size, fontWeight: weight,
      letterSpacing: '-0.045em', lineHeight: 1, color, textShadow: '0 6px 40px rgba(0,0,0,.45)', ...style,
    }}>
      {all.map(({ w, serif }, i) => {
        const p = spring({ frame: frame - at - i * stagger, fps, config: SNAP });
        const leave = Math.min(1, out * 1.1 - i * 0.04);
        const y = (1 - p) * 0.55 - Math.max(0, leave) * 0.45;
        const blur = (1 - Math.min(1, p)) * 14 + Math.max(0, leave) * 10;
        return (
          <span key={i} style={{
            display: 'inline-block', transform: `translateY(${y}em)`, opacity: Math.min(1, p) * (1 - Math.max(0, leave)),
            filter: blur > 0.2 ? `blur(${blur}px)` : undefined,
            ...(serif ? { fontFamily: F.serif, fontWeight: 400, letterSpacing: '-0.02em', fontSize: '1.08em' } : {}),
          }}>{w}</span>
        );
      })}
    </div>
  );
}
