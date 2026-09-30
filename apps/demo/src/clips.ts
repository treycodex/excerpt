/**
 * Pieces of a take, and where their moments land in the cut. Plain data and
 * arithmetic, no React: the score script (scripts/score.mjs) runs this under Node
 * to put sounds on the same frames the film puts pictures.
 */

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
