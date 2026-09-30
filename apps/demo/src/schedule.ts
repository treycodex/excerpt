import { sceneTime } from './clips.ts';
import type { Scene } from './timeline.ts';

export type Move = 'whip' | 'zoom' | 'wipe' | 'cut';
/** Frames two neighbouring scenes overlap while one hands over to the next. */
export const OVERLAP = 10;
export const FPS = 30;

export function secondsOf(scene: Scene): number {
  if (scene.kind !== 'footage') return scene.seconds;
  return scene.clips.reduce((sum, c) => sum + (c.to - c.from) / (c.rate ?? 1), 0);
}

export type Placed = { scene: Scene; from: number; frames: number };

/** Scenes overlap by OVERLAP frames so each transition has both sides on screen. */
export function layout(scenes: Scene[]): Placed[] {
  let at = 0;
  return scenes.map((scene, i) => {
    const frames = Math.round(secondsOf(scene) * FPS);
    const from = at;
    at += frames - (i < scenes.length - 1 && scene.exit !== 'cut' ? OVERLAP : 0);
    return { scene, from, frames };
  });
}

export type Sound = 'whoosh' | 'hit' | 'tick' | 'key' | 'snap' | 'riser' | 'boom';
export type Cue = { t: number; sound: Sound; gain?: number };

/**
 * Every sound the film makes, in seconds from its start, read off the same cut the
 * pictures come from: a whoosh under each transition, a hit as each stamp lands,
 * a tick on each click, keys under each shortcut and each typed character, and the
 * logo's snap. Change the cut and the sound follows.
 */
export function cues(scenes: Scene[]): { total: number; drop: number; close: number; cues: Cue[] } {
  const placed = layout(scenes);
  const out: Cue[] = [];
  const at = (p: Placed, s: number) => p.from / FPS + s;
  for (const [i, p] of placed.entries()) {
    const { scene } = p;
    const next = placed[i + 1];
    if (next && scene.exit !== 'cut') out.push({ t: next.from / FPS - 0.12, sound: 'whoosh', gain: scene.exit === 'zoom' ? 0.8 : 1 });
    if (scene.kind === 'open') {
      out.push({ t: at(p, 0), sound: 'riser', gain: 0.7 }, { t: at(p, 0.34), sound: 'snap' }, { t: at(p, 40 / FPS), sound: 'hit', gain: 0.8 });
    }
    if (scene.kind === 'problem') out.push({ t: at(p, 2 / FPS), sound: 'boom' }, { t: at(p, 44 / FPS), sound: 'hit', gain: 0.8 });
    if (scene.kind === 'install') {
      for (let k = 0; k < 18; k++) out.push({ t: at(p, 0.25 + k * 0.045), sound: 'key', gain: 0.35 + (k % 3) * 0.08 });
      out.push({ t: at(p, 6 / FPS), sound: 'hit', gain: 0.6 });
    }
    if (scene.kind === 'close') out.push({ t: at(p, 0), sound: 'boom' }, { t: at(p, 2 / FPS + 0.3), sound: 'snap' }, { t: at(p, 30 / FPS), sound: 'hit', gain: 0.7 });
    if (scene.kind !== 'footage') continue;
    for (const s of scene.stamps ?? []) out.push({ t: at(p, s.at), sound: 'hit', gain: 0.75 });
    for (const c of scene.clicks ?? []) {
      const t = sceneTime(scene.clips, c.at);
      if (t !== null) out.push({ t: at(p, t), sound: 'tick' });
    }
    for (const b of scene.beats ?? []) {
      const t = sceneTime(scene.clips, b);
      if (t !== null) out.push({ t: at(p, t), sound: 'tick', gain: 0.8 });
    }
    for (const k of scene.keys ?? []) for (let j = 0; j < k.keys.length; j++) out.push({ t: at(p, k.at + j * 0.07), sound: 'key' });
  }
  const last = placed.at(-1)!;
  const problem = placed.find((p) => p.scene.kind === 'problem')!;
  return {
    total: (last.from + last.frames) / FPS,
    drop: problem.from / FPS,
    close: last.from / FPS,
    cues: out.filter((c) => c.t >= 0).sort((a, b) => a.t - b.t),
  };
}
