import { AbsoluteFill, Audio, Composition, Sequence, staticFile } from 'remotion';
import { C, FPS, H, W } from './brand/tokens';
import { loadBrandFonts } from './brand/fonts';
import { Shell } from './components/Transition';
import { FootageScene } from './scenes/FootageScene';
import { CloseScene, InstallScene, OpenScene, ProblemScene } from './scenes/MotionScenes';
import { SCENES, validate, type Scene } from './timeline';
import { layout } from './schedule.ts';

loadBrandFonts();
validate(SCENES);

function Body({ scene }: { scene: Scene }) {
  switch (scene.kind) {
    case 'open': return <OpenScene />;
    case 'problem': return <ProblemScene />;
    case 'install': return <InstallScene />;
    case 'close': return <CloseScene />;
    case 'footage': return <FootageScene scene={scene} />;
  }
}

export function Demo({ scenes = SCENES }: { scenes?: Scene[] }) {
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {/* Music and effects in one track, timed to this same cut by scripts/score.mjs. */}
      <Audio src={staticFile('audio/soundtrack.wav')} />
      {layout(scenes).map(({ scene, from, frames }) => (
        <Sequence key={scene.id} from={from} durationInFrames={frames} name={scene.id}>
          <Shell duration={frames} enter={scene.enter} exit={scene.exit}>
            <Body scene={scene} />
          </Shell>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

const last = layout(SCENES).at(-1)!;

export function Root() {
  return <Composition id="Demo" component={Demo} durationInFrames={last.from + last.frames} fps={FPS} width={W} height={H} defaultProps={{}} />;
}
