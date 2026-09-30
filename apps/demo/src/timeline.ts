import type { IconName } from '@excerpt/ui';
import type { CameraKey, Click, Highlight } from './components/Footage';
import { sceneTime, type Clip } from './clips.ts';
import type { Keys } from './components/Overlays';
import type { Move } from './schedule.ts';

/**
 * The cut, as data. Footage scenes last exactly as long as their clips (speed
 * ramps included); every time here is seconds from the scene's own start, except
 * `clicks` and `beats`, which are the takes' logged times and are placed through the
 * clips. A shorter or re-ordered cut is a different list, not new code.
 */
export type StampLine = { at: number; lead: string; turn?: string; hold?: number };
type Base = { id: string; enter: Move; exit: Move };
export type FootageScene = Base & {
  kind: 'footage'; shot: string; chapter: [number: string, title: string, icon: IconName];
  file?: string; screen?: { w: number; h: number }; clips: Clip[]; chrome?: boolean; focus?: [number, number, number, number];
  camera?: CameraKey[]; clicks?: Click[]; beats?: number[]; highlights?: Highlight[]; keys?: Keys[]; stamps?: StampLine[];
};
export type MotionScene = Base & { kind: 'open' | 'problem' | 'install' | 'close'; seconds: number };
export type Scene = FootageScene | MotionScene;

const STAGE = { file: 'stage.mp4', screen: { w: 1440, h: 900 }, chrome: true } as const;

export const SCENES: Scene[] = [
  { id: 'open', kind: 'open', seconds: 3.6, enter: 'cut', exit: 'zoom' },
  { id: 'problem', kind: 'problem', seconds: 3.1, enter: 'zoom', exit: 'whip' },
  { id: 'install', kind: 'install', seconds: 2.9, enter: 'whip', exit: 'whip' },
  {
    // Real: first-run setup on this Mac. Permissions, the audio check (sped up), done.
    id: 'setup', kind: 'footage', shot: 'setup', chapter: ['01', 'Set up', 'clapper'], enter: 'whip', exit: 'zoom',
    clips: [{ from: 22.6, to: 25.6, rate: 1.4 }, { from: 43.2, to: 51, rate: 3.6 }, { from: 70.6, to: 74.3, rate: 1.4 }],
    camera: [{ at: 0, rect: [385, 92, 940, 742] }], focus: [395, 103, 920, 720],
    beats: [25.48, 43.52, 73.88],
    stamps: [{ at: 0.05, lead: 'Set up', turn: 'in a minute.' }],
  },
  {
    // Real: joining a Meet call, and Excerpt asking.
    id: 'prompt', kind: 'footage', shot: 'meeting', chapter: ['02', 'On a call', 'record'], enter: 'zoom', exit: 'whip',
    clips: [{ from: 4.6, to: 6.8 }, { from: 21.3, to: 24.4, rate: 1.15 }],
    camera: [{ at: 0, rect: [880, 20, 830, 540] }, { at: 1.1, rect: [1190, 34, 520, 293] }],
    beats: [21.85, 23.25],
    highlights: [{ at: 1.3, to: 4.9, rect: [1348, 60, 340, 254] }],
    stamps: [{ at: 0.05, lead: 'A call starts.', turn: 'It asks first.' }],
  },
  {
    // Real: the call with film-style captions, then Catch up.
    id: 'captions', kind: 'footage', shot: 'meeting2', chapter: ['03', 'Captions', 'subtitles'], enter: 'whip', exit: 'whip',
    clips: [{ from: 33, to: 37.6, rate: 1.15 }, { from: 51, to: 55, rate: 1.1 }],
    camera: [{ at: 0, rect: [40, 360, 1640, 740] }, { at: 4, rect: [1000, 380, 710, 600] }],
    beats: [51.2],
    keys: [{ at: 4.1, to: 5.9, keys: ['⌘', '⇧', 'J'], label: 'Catch up' }],
    stamps: [{ at: 0.05, lead: 'Captions,', turn: 'live.' }],
  },
  {
    // Real: capturing the shared slide mid-call.
    id: 'capture', kind: 'footage', shot: 'meeting2', chapter: ['04', 'Capture', 'viewfinder'], enter: 'whip', exit: 'zoom',
    clips: [{ from: 63.4, to: 68.6, rate: 1.15 }],
    camera: [{ at: 0, rect: [640, 120, 1070, 700] }, { at: 2.6, rect: [1260, 30, 450, 300] }],
    beats: [65.05],
    keys: [{ at: 1.2, to: 2.8, keys: ['⌘', '⇧', 'S'], label: 'Capture moment' }],
    stamps: [{ at: 0.05, lead: 'Keep the', turn: 'moment.' }],
  },
  {
    // Real: leaving the call; Excerpt asks before it stops.
    id: 'end', kind: 'footage', shot: 'meeting', chapter: ['05', 'Wrap', 'cut'], enter: 'zoom', exit: 'wipe',
    clips: [{ from: 207.4, to: 209.4 }, { from: 216, to: 218.6, rate: 1.1 }],
    camera: [{ at: 0, rect: [880, 20, 830, 540] }, { at: 0.6, rect: [1190, 34, 520, 293] }],
    beats: [217.09],
    highlights: [{ at: 0.9, to: 4.4, rect: [1348, 60, 340, 254] }],
    stamps: [{ at: 0.05, lead: 'Call ends.', turn: 'It asks again.' }],
  },
  {
    // Excerpt's own editor on the recorded meeting, driven by script.
    id: 'transcript', kind: 'footage', shot: 'stage', ...STAGE, chapter: ['06', 'Transcript', 'script'], enter: 'wipe', exit: 'whip',
    clips: [{ from: 0.9, to: 3.9, rate: 1.4 }, { from: 6.3, to: 11.6, rate: 1.35 }],
    camera: [{ at: 0, rect: [150, 80, 1140, 740] }, { at: 2.1, rect: [380, 330, 820, 560] }],
    clicks: [{ at: 6.88, x: 676, y: 601 }, { at: 10.15, x: 724, y: 794 }],
    stamps: [{ at: 0.05, lead: 'Words and screens,', turn: 'together.' }, { at: 2.3, lead: 'Fix any word.', turn: 'The original stays.', hold: 22 }],
  },
  {
    id: 'notes', kind: 'footage', shot: 'stage', ...STAGE, chapter: ['07', 'Notes', 'storyboard'], enter: 'whip', exit: 'whip',
    clips: [{ from: 13.7, to: 17.2, rate: 1.6 }, { from: 18.1, to: 21.3, rate: 1.4 }, { from: 21.3, to: 25.2, rate: 1.5 }],
    camera: [{ at: 0, rect: [150, 60, 1140, 760] }, { at: 2.3, rect: [230, 40, 980, 760] }, { at: 4.5, rect: [330, 80, 860, 700] }],
    clicks: [{ at: 14.15, x: 627, y: 279 }, { at: 16.06, x: 588, y: 596 }, { at: 21.46, x: 597, y: 684 }],
    stamps: [{ at: 0.05, lead: 'Notes that', turn: 'cite the call.' }],
  },
  {
    id: 'export', kind: 'footage', shot: 'stage', ...STAGE, chapter: ['08', 'Export', 'canister'], enter: 'whip', exit: 'zoom',
    clips: [{ from: 26.2, to: 28.55 }],
    camera: [{ at: 0, rect: [1010, 10, 430, 242] }],
    clicks: [{ at: 26.58, x: 1377, y: 44 }, { at: 28.26, x: 1319, y: 153 }],
    stamps: [{ at: 0.05, lead: 'Take it', turn: 'anywhere.', hold: 20 }],
  },
  { id: 'close', kind: 'close', seconds: 4.6, enter: 'zoom', exit: 'cut' },
];

/** Checks the data against itself, so a bad edit fails the render instead of a frame. */
export function validate(scenes: Scene[]) {
  for (const s of scenes) {
    if (s.kind !== 'footage') continue;
    for (const b of s.beats ?? []) if (sceneTime(s.clips, b) === null) console.warn(`${s.id}: beat ${b} falls in a cut`);
  }
}
