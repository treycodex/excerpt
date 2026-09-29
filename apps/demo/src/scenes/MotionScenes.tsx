import type { ReactNode } from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Icon, type IconName } from '@excerpt/ui';
import { C, F, FPS } from '../brand/tokens';
import { Kinetic, SNAP, useSpringAt } from '../components/Kinetic';
import { Beam, Grain, Vignette, Wordmark } from '../components/primitives';

function Ground({ children, beam = true }: { children: ReactNode; beam?: boolean }) {
  return (
    <AbsoluteFill style={{ background: C.ground, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      {beam && <Beam />}
      {children}
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
}

/**
 * Motif 3 as a logo move: four ember corner brackets fly in from the frame's
 * corners and lock round whatever they frame, with a small overshoot.
 */
function BracketSnap({ at = 0, w, h, children }: { at?: number; w: number; h: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 150, mass: 0.8 } });
  const corner = (sx: -1 | 1, sy: -1 | 1) => {
    const x = sx * (w / 2) + sx * (1 - p) * width * 0.5;
    const y = sy * (h / 2) + sy * (1 - p) * height * 0.5;
    const size = 34;
    return (
      <i key={`${sx}${sy}`} style={{
        position: 'absolute', left: '50%', top: '50%', width: size, height: size, opacity: Math.min(1, p * 2),
        transform: `translate(${x - (sx > 0 ? size : 0)}px, ${y - (sy > 0 ? size : 0)}px)`,
        borderTop: sy < 0 ? `3px solid ${C.ember}` : undefined, borderBottom: sy > 0 ? `3px solid ${C.ember}` : undefined,
        borderLeft: sx < 0 ? `3px solid ${C.ember}` : undefined, borderRight: sx > 0 ? `3px solid ${C.ember}` : undefined,
      }} />
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {children}
      {corner(-1, -1)}{corner(1, -1)}{corner(-1, 1)}{corner(1, 1)}
    </AbsoluteFill>
  );
}

/** The mark lands inside the brackets, then gives way to the landing page's line. */
export function OpenScene() {
  const frame = useCurrentFrame();
  const mark = useSpringAt(4);
  const leave = useSpringAt(34);
  const markOpacity = Math.min(1, mark) * (1 - leave);
  return (
    <Ground>
      <AbsoluteFill style={{ opacity: 1 - leave, transform: `scale(${1 - leave * 0.08})` }}>
        <BracketSnap w={640} h={230}>
          <div style={{ opacity: markOpacity, transform: `scale(${0.9 + mark * 0.1})`, filter: `blur(${(1 - Math.min(1, mark)) * 12}px)` }}>
            <Wordmark size={128} />
          </div>
        </BracketSnap>
      </AbsoluteFill>
      {frame >= 38 && (
        <div style={{ display: 'grid', gap: 18, padding: '0 120px' }}>
          <Kinetic text="The screen. The speech." at={40} size={122} />
          <Kinetic text="" turn="The meeting, kept together." at={52} size={122} />
        </div>
      )}
    </Ground>
  );
}

/** The claim the product is built against, in two hits. */
export function ProblemScene() {
  const frame = useCurrentFrame();
  return (
    <Ground beam={false}>
      {frame < 42
        ? <Kinetic text="Meetings move fast." at={2} size={140} exitAt={34} />
        : <Kinetic text="Notes you can't check" turn="aren't notes." at={44} size={124} style={{ maxWidth: 1500 }} />}
    </Ground>
  );
}

const COMMAND = 'curl -fsSL https://excerpt-rho.vercel.app/install.sh | sh';
/** The installer's own messages, apps/web/public/install.sh, sped up. */
const OUTPUT = ['Downloading Excerpt…', 'Installing into /Applications…', 'Excerpt is installed. Opening it…'];

/** Install in one line. Drawn: running it would replace the build being filmed with the last release. */
export function InstallScene() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const card = useSpringAt(0);
  const typed = COMMAND.slice(0, Math.max(0, Math.floor((t - 0.25) * 70)));
  const tag = useSpringAt(4);
  return (
    <Ground beam={false}>
      <div style={{ display: 'grid', gap: 34, justifyItems: 'center' }}>
        <div style={{ opacity: Math.min(1, tag), transform: `translateY(${(1 - tag) * 20}px)` }}>
          <Kinetic text="Free. No account." turn="One line." at={6} size={88} />
        </div>
        <div style={{
          width: 1180, borderRadius: 18, background: C.raise, border: `1px solid ${C.edge}`, overflow: 'hidden', textAlign: 'left',
          boxShadow: '0 60px 140px -60px rgba(0,0,0,.9)', transform: `translateY(${(1 - card) * 60}px) scale(${0.96 + card * 0.04})`, opacity: Math.min(1, card),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.hair}` }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <i key={c} style={{ width: 13, height: 13, borderRadius: '50%', background: c, opacity: 0.85 }} />)}
          </div>
          <div style={{ padding: '26px 34px 32px', fontFamily: F.mono, fontSize: 26, lineHeight: 1.7, color: C.ink, minHeight: 210 }}>
            <div><span style={{ color: C.ember }}>$ </span>{typed}</div>
            {OUTPUT.map((line, i) => {
              const p = spring({ frame: frame - (32 + i * 9), fps: FPS, config: SNAP });
              return frame >= 32 + i * 9 ? <div key={line} style={{ color: C.dim, opacity: Math.min(1, p), transform: `translateX(${(1 - p) * 30}px)` }}>{line}</div> : null;
            })}
          </div>
        </div>
      </div>
    </Ground>
  );
}

const TRUST: [IconName, string][] = [
  ['ticket', 'Free, no account'],
  ['seat', 'Saved on your Mac'],
  ['code', 'Open source'],
];

/** The ending: the mark snaps back into its brackets, then where to get it. */
export function CloseScene() {
  const frame = useCurrentFrame();
  const up = spring({ frame: frame - 26, fps: FPS, config: SNAP });
  return (
    <Ground>
      <AbsoluteFill style={{ transform: `translateY(${-up * 230}px) scale(${1 - up * 0.35})` }}>
        <BracketSnap w={640} h={230} at={2}>
          <div style={{ opacity: Math.min(1, useSpringAt(6)) }}><Wordmark size={128} /></div>
        </BracketSnap>
      </AbsoluteFill>
      <div style={{ display: 'grid', gap: 34, justifyItems: 'center', marginTop: 190 }}>
        <Kinetic text="The meeting," turn="kept together." at={30} size={96} />
        <div style={{ display: 'flex', gap: 40 }}>
          {TRUST.map(([icon, text], i) => {
            const p = spring({ frame: frame - (44 + i * 4), fps: FPS, config: SNAP });
            return (
              <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: F.sans, fontSize: 28, color: C.dim, opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 20}px)` }}>
                <span style={{ width: 28, height: 28, color: C.paper }}><Icon name={icon} /></span>{text}
              </span>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 18, opacity: Math.min(1, useSpringAt(58)), transform: `translateY(${(1 - Math.min(1, useSpringAt(58))) * 24}px)` }}>
          <span style={{ padding: '18px 30px', borderRadius: 14, background: C.paper, color: '#14170F', fontFamily: F.sans, fontSize: 30, fontWeight: 500 }}>
            excerpt-rho.vercel.app
          </span>
          <span style={{ padding: '18px 26px', borderRadius: 14, border: `1px solid ${C.edge}`, fontFamily: F.mono, fontSize: 22, color: C.ink, display: 'inline-flex', alignItems: 'center' }}>
            curl -fsSL excerpt-rho.vercel.app/install.sh | sh
          </span>
        </div>
      </div>
    </Ground>
  );
}

