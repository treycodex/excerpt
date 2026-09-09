import type { ReactNode } from 'react';

/**
 * Motif 3 — The Frame. Selection is four corner brackets. Never a border, never a
 * fill, never a glow.
 */
export function Frame({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <div className={active ? 'framed is-active' : 'framed'}>
      {children}
      <span className="frame-b" aria-hidden />
    </div>
  );
}
