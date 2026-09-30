import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../brand/tokens';
import { Kinetic, SNAP } from './Kinetic';

import { OVERLAP, type Move } from '../schedule.ts';
export { OVERLAP, type Move };

/**
 * A scene's way in and out. Scenes overlap by OVERLAP frames, so while one leaves
 * the next is already arriving: a whip pan with motion blur, a zoom through, or a
 * hard wipe. Nothing simply fades.
 */
export function Shell({ duration, enter, exit, children }: { duration: number; enter: Move; exit: Move; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const inP = enter === 'cut' ? 1 : spring({ frame, fps, config: { damping: 18, stiffness: 170, mass: 0.8 }, durationInFrames: OVERLAP + 6 });
  const outP = exit === 'cut' ? 0 : interpolate(frame, [duration - OVERLAP, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = outP * outP;

  let transform = '';
  let blur = 0;
  let clip: string | undefined;
  let opacity = 1;
  if (enter === 'whip') { transform += ` translateX(${(1 - inP) * width * 0.42}px)`; blur += (1 - inP) * 28; }
  if (enter === 'zoom') { transform += ` scale(${1.22 - 0.22 * inP})`; blur += (1 - inP) * 22; opacity *= Math.min(1, inP * 1.6); }
  if (enter === 'wipe') clip = `inset(0 0 0 ${(1 - inP) * 100}%)`;
  if (exit === 'whip') { transform += ` translateX(${-eased * width * 0.42}px)`; blur += eased * 28; }
  if (exit === 'zoom') { transform += ` scale(${1 + eased * 0.16})`; blur += eased * 16; opacity *= 1 - eased; }
  if (exit === 'wipe') opacity *= 1 - eased * 0.4;

  return (
    <AbsoluteFill style={{
      transform: transform || undefined, filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
      clipPath: clip, opacity, background: C.ground,
    }}>
      {children}
    </AbsoluteFill>
  );
}

/**
 * The feature, said in a few words, over the shot: the footage behind blurs and
 * dims, the line lands word by word, then leaves and the picture snaps into focus.
 * These carry the narration; there are no subtitles to read.
 */
export function Stamps({ lines, children }: {
  lines: { at: number; lead: string; turn?: string | undefined; hold?: number | undefined }[]; children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = lines.map((l) => {
    const at = Math.round(l.at * fps), hold = l.hold ?? 26;
    const on = spring({ frame: frame - at, fps, config: SNAP, durationInFrames: 8 });
    const off = spring({ frame: frame - at - hold, fps, config: SNAP });
    return { ...l, at, hold, veil: frame < at ? 0 : Math.max(0, Math.min(1, on) - off) };
  });
  const first = shown[0];
  // Before the first line lands, the shot is already veiled: it opens on the words.
  const veil = Math.max(first && frame < first.at ? 1 : 0, ...shown.map((l) => l.veil));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: veil > 0.02 ? `blur(${veil * 18}px) brightness(${1 - veil * 0.6})` : undefined, transform: `scale(${1 + veil * 0.05})` }}>
        {children}
      </AbsoluteFill>
      {/* Over the app's light paper the words need ground under them, not just blur. */}
      {veil > 0.01 && <AbsoluteFill style={{ background: `rgba(14,15,13,${veil * 0.62})` }} />}
      {shown.filter((l) => frame >= l.at - 1 && frame < l.at + l.hold + 14).map((l) => (
        <AbsoluteFill key={l.at} style={{ alignItems: 'center', justifyContent: 'center', padding: '0 140px' }}>
          <Kinetic text={l.lead} turn={l.turn} at={l.at} size={128} exitAt={l.at + l.hold} />
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
}
