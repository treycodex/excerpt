import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_SOFT, F, FPS } from '../brand/tokens';

const soft = Easing.bezier(...EASE_SOFT);

function useWindow(at: number, to: number) {
  const t = useCurrentFrame() / FPS;
  const p = interpolate(t, [at, at + 0.35, to - 0.25, to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: soft });
  return { visible: t >= at && t < to, p };
}

export type Keys = { at: number; to: number; keys: string[]; label: string };

/** The shortcut being pressed, as keycaps, for presses the camera cannot see. */
export function Keycaps({ at, to, keys, label }: Keys) {
  const { visible, p } = useWindow(at, to);
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', left: 56, top: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 26px 14px 14px',
      borderRadius: 20, background: 'rgba(14,15,13,.82)', border: `1px solid ${C.edge}`, backdropFilter: 'blur(12px)',
      opacity: p, transform: `translateY(${(1 - p) * 12}px)`,
    }}>
      {keys.map((k) => (
        <span key={k} style={{
          minWidth: 64, height: 64, padding: '0 14px', display: 'grid', placeItems: 'center', boxSizing: 'border-box',
          fontFamily: F.sans, fontSize: 30, fontWeight: 500, color: C.paperInk, background: C.paper,
          borderRadius: 12, boxShadow: `0 3px 0 #c9cbb4, 0 18px 40px -18px rgba(0,0,0,.7)`,
        }}>{k}</span>
      ))}
      <span style={{ marginLeft: 10, fontFamily: F.mono, fontSize: 20, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.ink }}>{label}</span>
    </div>
  );
}
