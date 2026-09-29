import { AbsoluteFill, Composition, Sequence } from 'remotion';
import { C, FPS, H, W } from './brand/tokens';
import { loadBrandFonts } from './brand/fonts';
import { OVERLAP, Shell } from './components/Transition';
import { FootageScene } from './scenes/FootageScene';
import { CloseScene, InstallScene, OpenScene, ProblemScene } from './scenes/MotionScenes';
import { SCENES, secondsOf, validate, type Scene } from './timeline';

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

/** Scenes overlap by OVERLAP frames so each transition has both sides on screen. */
function layout(scenes: Scene[]) {
  let at = 0;
  return scenes.map((scene, i) => {
    const frames = Math.round(secondsOf(scene) * FPS);
    const from = at;
    at += frames - (i < scenes.length - 1 && scene.exit !== 'cut' ? OVERLAP : 0);
    return { scene, from, frames };
  });
}

export function Demo({ scenes = SCENES }: { scenes?: Scene[] }) {
  return (
    <AbsoluteFill style={{ background: C.ground }}>
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
