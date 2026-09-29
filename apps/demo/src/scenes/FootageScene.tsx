import { AbsoluteFill } from 'remotion';
import { Icon } from '@excerpt/ui';
import { C, F } from '../brand/tokens';
import { Footage } from '../components/Footage';
import { useSpringAt } from '../components/Kinetic';
import { Keycaps } from '../components/Overlays';
import { Stamps } from '../components/Transition';
import { Grain } from '../components/primitives';
import type { FootageScene as Scene } from '../timeline';

/** One shot of the real app on the cinema ground: its stamp, its chapter, its keys. */
export function FootageScene({ scene }: { scene: Scene }) {
  const [number, title, icon] = scene.chapter;
  const tag = useSpringAt(Math.round(((scene.stamps?.[0]?.at ?? 0) + 0.9) * 30));
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <Stamps lines={scene.stamps ?? []}>
        <Footage shot={scene.shot} file={scene.file} screen={scene.screen} clips={scene.clips} chrome={scene.chrome}
          focus={scene.focus} camera={scene.camera} clicks={scene.clicks} beats={scene.beats} highlights={scene.highlights} />
      </Stamps>
      <div style={{
        position: 'absolute', right: 48, top: 40, display: 'inline-flex', alignItems: 'center', gap: 12,
        padding: '10px 16px 10px 12px', borderRadius: 999, background: 'rgba(14,15,13,.8)', border: `1px solid ${C.hair}`,
        fontFamily: F.mono, fontSize: 17, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.dim,
        opacity: Math.min(1, tag), transform: `translateY(${(1 - Math.min(1, tag)) * -16}px)`,
      }}>
        <span style={{ width: 22, height: 22, color: C.paper }}><Icon name={icon} /></span>
        <span style={{ color: C.ember }}>{number}</span>{title}
      </div>
      {scene.shot !== 'setup' && (
        // The meeting on screen is scripted and voiced by text-to-speech; the film says so.
        <span style={{
          position: 'absolute', left: 48, bottom: 36, padding: '8px 14px', borderRadius: 999, background: 'rgba(14,15,13,.72)',
          fontFamily: F.mono, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.faint,
          opacity: Math.min(1, tag),
        }}>Scripted demo · synthetic voices</span>
      )}
      {scene.keys?.map((k) => <Keycaps key={k.label + k.at} {...k} />)}
      <Grain opacity={0.035} />
    </AbsoluteFill>
  );
}
