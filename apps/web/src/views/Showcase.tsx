import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Wordmark } from './Wordmark';
import './showcase.css';

/* ── The showcase ──────────────────────────────────────────────────────────────
   One frame that plays the three things Excerpt does, in the order a meeting
   has them: subtitles while it happens, a screen captured onto the meeting clock,
   and afterwards the transcript that notes are written from.

   Each scene is a short film choreographed in CSS — every element carries its own
   delay — and remounted by key, so switching tabs restarts it cleanly. The active
   tab's progress bar is the scene's clock: when its animation ends, the next scene
   starts. Pausing (the button, or scrolling the frame away) pauses every animation
   in the frame at once, so the choreography never drifts from the bar.

   Reduced motion removes every animation. The base styles are each scene's final
   state, and whatever only exists mid-scene is `dm-transient`, which reduced
   motion hides — so each tab becomes a still of how its scene ends, and nothing
   advances on its own. */

type SceneId = 'captions' | 'capture' | 'notes';
type Scene = {
  id: SceneId; tab: string; short: string; chrome: string; caption: string; description: string;
  seconds: number; clock: number | null;
};

const SCENES: readonly [Scene, Scene, Scene] = [
  {
    id: 'captions', tab: 'Live captions', short: 'Captions',
    chrome: 'LIVE · TWO LINES · BROKEN ON PHRASE',
    caption: 'Film-style subtitles over the meeting itself, so you can watch the work while it is discussed.',
    description: 'A video meeting with a shared slide. Two-line subtitles appear word by word over the meeting window as each person speaks.',
    seconds: 11.5, clock: 2,
  },
  {
    id: 'capture', tab: 'Visual capture', short: 'Capture',
    chrome: 'CAPTURE MOMENT · ⌘⇧S',
    caption: 'Captured screens sit on the meeting clock, with the speech from either side of them.',
    description: 'Pressing Command Shift S selects the shared slide. The captured screen is placed at 0:10 on the meeting clock, between the speech before and after it.',
    seconds: 10, clock: 7,
  },
  {
    id: 'notes', tab: 'Transcript & notes', short: 'Notes',
    chrome: 'AFTER THE MEETING · TRANSCRIPT → NOTES',
    caption: 'The transcript first. Write notes when you want them, and follow each one back to its source.',
    description: 'The meeting opens as a transcript with the screenshot in place. Choosing Write notes produces editable notes, each linked to the transcript passage it came from.',
    seconds: 13.5, clock: null,
  },
];

/** `animation-delay` and `-duration` for something that exists from `at` to `until`. */
const life = (at: number, until: number): CSSProperties => ({
  animationDelay: `${at}s`, animationDuration: `${until - at}s`,
});
const delay = (at: number): CSSProperties => ({ animationDelay: `${at}s` });

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function Showcase() {
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const running = playing && inView;

  // Off screen, the film holds its place rather than playing to nobody.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.25 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const scene = SCENES[index] ?? SCENES[0];
  const key = `${scene.id}-${cycle}`;
  const elapsed = useElapsed(running, key);
  const go = (i: number) => { setIndex(i); setCycle((c) => c + 1); setPlaying(true); };

  return (
    <section className="lp-showcase dm" aria-label="Excerpt in use" data-paused={running ? undefined : ''}>
      <div className="lp-tabs dm-tabs" role="tablist" aria-label="What to show">
        {SCENES.map((s, i) => (
          <button key={s.id} role="tab" id={`tab-${s.id}`} aria-selected={i === index}
            aria-controls="lp-frame" className={i === index ? 'is-on' : undefined}
            onClick={() => go(i)}>
            {i === index && (
              <i key={key} className="dm-progress" aria-hidden
                style={{ animationDuration: `${s.seconds}s` }}
                onAnimationEnd={() => go((i + 1) % SCENES.length)} />
            )}
            <span className="dm-tab-long">{s.tab}</span>
            <span className="dm-tab-short">{s.short}</span>
          </button>
        ))}
      </div>

      <div className="lp-glow" aria-hidden />
      <figure className="lp-frame" id="lp-frame" ref={frame} role="tabpanel" aria-labelledby={`tab-${scene.id}`}>
        <div className="lp-frame-bar">
          <span className="lp-frame-mark"><Wordmark markOnly /></span>
          <span className="lp-label" key={`chrome-${key}`}>{scene.chrome}</span>
          <span className="dm-bar-end">
            <button className="dm-pause" onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause the demo' : 'Play the demo'}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <span className="lp-frame-clock">
              {scene.clock === null ? '24 MIN' : <><b className="dm-rec" aria-hidden />{fmt(scene.clock + elapsed)}</>}
            </span>
          </span>
        </div>
        <div className="lp-frame-media dm-media">
          <div className="dm-stage" key={key} role="img" aria-label={scene.description}>
            {scene.id === 'captions' && <CaptionsScene />}
            {scene.id === 'capture' && <CaptureScene />}
            {scene.id === 'notes' && <NotesScene />}
          </div>
          <span className="lp-brackets" aria-hidden><i /><i /><i /><i /></span>
        </div>
        <figcaption key={`cap-${key}`} className="dm-figcaption">{scene.caption}</figcaption>
      </figure>
    </section>
  );
}

/** Whole seconds the current scene has been playing; stops while paused. */
function useElapsed(running: boolean, key: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => setElapsed(0), [key]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running, key]);
  return elapsed;
}

/* ── Shared set ─────────────────────────────────────────────────────────────── */

const PEOPLE = [
  { name: 'Maya', initials: 'MR', tone: 'a' },
  { name: 'Jon', initials: 'JT', tone: 'b' },
  { name: 'You', initials: 'Y', tone: 'c' },
] as const;

const BARS = [['Variant A', 46], ['Variant B', 62], ['New opening', 78]] as const;

/** One person's turn. `final` is the turn a still of the scene (reduced motion) keeps. */
type Turn = { lines: readonly string[]; at: number; until: number; who: number; final?: boolean };

function Slide({ grow = true }: { grow?: boolean }) {
  return (
    <div className="dm-slide">
      <span className="dm-slide-kicker">Week 38 · synthetic example</span>
      <strong>Creative comparison</strong>
      {BARS.map(([label, w], i) => (
        <div className="dm-slide-row" key={label}>
          <span>{label}</span>
          <i className={grow ? 'dm-grow' : undefined} style={{ width: `${w}%`, ...delay(0.35 + i * 0.14) }} />
        </div>
      ))}
    </div>
  );
}

/** The Mac the meeting is on: a menu bar with Excerpt in it, and nothing else of ours. */
function Desk({ children, pingAt }: { children: ReactNode; pingAt?: number }) {
  return (
    <div className="dm-desk">
      <div className="dm-menubar">
        <span className="dm-menubar-app"><b>Meeting</b><span>File</span><span>View</span><span>Window</span></span>
        <span className="dm-menubar-status">
          <span className="dm-menubar-e">
            <Wordmark markOnly />
            <span className="dm-listen" aria-hidden><i /><i /><i /><i /></span>
            {pingAt !== undefined && <i className="dm-ping dm-transient" style={delay(pingAt)} />}
          </span>
          <span>Mon 10:02</span>
        </span>
      </div>
      {children}
    </div>
  );
}

function Call({ turns = [], share, children }: { turns?: readonly Turn[]; share?: ReactNode; children?: ReactNode }) {
  return (
    <div className="dm-call">
      <div className="dm-call-bar">
        <span className="dm-lights" aria-hidden><i /><i /><i /></span>
        <span>Autumn campaign review</span>
        <span className="dm-call-count">3 in call</span>
      </div>
      <div className="dm-call-body">
        <div className="dm-share">
          <Slide />
          {share}
        </div>
        <div className="dm-people">
          {PEOPLE.map((p, i) => (
            <div className={`dm-person dm-tone-${p.tone}`} key={p.name}>
              <span className="dm-avatar">{p.initials}</span>
              <span className="dm-name">{p.name}</span>
              {turns.filter((t) => t.who === i).map((t) => (
                <i className={t.final ? 'dm-speaking' : 'dm-speaking dm-transient'} key={t.at} style={life(t.at, t.until)} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Two lines that arrive word by word, the way live recognition settles. */
function Caption({ turn, transient }: { turn: Turn; transient: boolean }) {
  let n = 0;
  return (
    <p className={transient ? 'dm-caption dm-life dm-transient' : 'dm-caption dm-life'} style={life(turn.at, turn.until)}>
      {turn.lines.map((line) => (
        <span className="dm-caption-line" key={line}>
          {line.split(' ').map((word, i) => (
            <span key={i}>{i > 0 && ' '}<span className="dm-word" style={delay(turn.at + 0.12 + n++ * 0.11)}>{word}</span></span>
          ))}
        </span>
      ))}
    </p>
  );
}

function Toast({ at, until, children }: { at: number; until: number; children: ReactNode }) {
  return <div className="dm-toast dm-life dm-transient" style={life(at, until)}>{children}</div>;
}

/** Arrives beside its target, clicks (or rests, to hover), and goes. */
function Cursor({ at, stay = false }: { at: number; stay?: boolean }) {
  return (
    <span className={stay ? 'dm-cursor dm-cursor-stay dm-transient' : 'dm-cursor dm-transient'}
      style={stay ? delay(at) : life(at, at + 1.3)} aria-hidden>
      <svg viewBox="0 0 16 22"><path d="M1 1v17l4.6-4.3 3 6.8 3-1.3-3-6.6H15z" /></svg>
      {!stay && <i className="dm-ripple" style={delay(at + 0.6)} />}
    </span>
  );
}

/* ── Scene 1 · Live captions ────────────────────────────────────────────────── */

const TURNS: readonly Turn[] = [
  { lines: ['The new opening holds attention longer,', 'but the product arrives too late.'], at: 0.9, until: 4.3, who: 0 },
  { lines: ['So the product moves', 'into the first three seconds?'], at: 4.5, until: 7.5, who: 1 },
  { lines: ['Yes — I’ll send a revised cut', 'on Thursday.'], at: 7.7, until: 11.5, who: 2, final: true },
];

function CaptionsScene() {
  return (
    <Desk>
      <Call turns={TURNS}>
        <div className="dm-captions">
          {TURNS.map((t) => <Caption key={t.at} turn={t} transient={!t.final} />)}
        </div>
      </Call>
      <Toast at={0.2} until={2.6}><Wordmark markOnly /> Captions on <kbd>⌘⇧C</kbd></Toast>
    </Desk>
  );
}

/* ── Scene 2 · Visual capture ───────────────────────────────────────────────── */

const LEAD_IN: Turn = { lines: ['Here’s where the three cuts landed.'], at: 0.1, until: 2.3, who: 0 };

function CaptureScene() {
  return (
    <Desk pingAt={3.6}>
      <Call turns={[LEAD_IN]} share={<>
        <span className="dm-marquee dm-transient">
          <span className="dm-marquee-size">640 × 360</span>
          <span className="dm-crosshair" />
        </span>
        <span className="dm-fly dm-transient"><Slide grow={false} /></span>
      </>}>
        <div className="dm-captions"><Caption turn={LEAD_IN} transient /></div>
      </Call>
      <div className="dm-keys dm-life dm-transient" style={life(0.4, 2.7)}>
        <kbd style={delay(0.8)}>⌘</kbd><kbd style={delay(0.9)}>⇧</kbd><kbd style={delay(1)}>S</kbd>
        <span>Capture moment</span>
      </div>
      <span className="dm-flash dm-transient" />
      <Toast at={3.7} until={6.2}><Wordmark markOnly /> Screen captured · 0:10</Toast>
      <MeetingClock />
    </Desk>
  );
}

/** Not app chrome — the idea of it: a meeting's speech on one clock, and the
    captured screen dropped onto that clock where it happened. */
function MeetingClock() {
  const ticks = [0, 5, 10, 15, 20];
  return (
    <div className="dm-clock">
      <div className="dm-clock-head">
        <span className="lp-label">The meeting clock</span>
        <span>Autumn campaign review</span>
      </div>
      <div className="dm-clock-grid">
        <div className="dm-ruler" style={{ gridArea: '1 / 2' }}>
          {ticks.map((t) => <span key={t} style={{ left: `${(t / 25) * 100}%` }}>{fmt(t)}</span>)}
        </div>
        <em style={{ gridArea: '2 / 1' }}>Meeting audio</em>
        <div className="dm-lane" style={{ gridArea: '2 / 2' }}>
          <b className="dm-seg" style={{ left: '8%', width: '26%', ...delay(6.3) }} />
          <b className="dm-seg dm-seg-quiet" style={{ left: '88%', width: '10%' }} />
        </div>
        <em style={{ gridArea: '3 / 1' }}>You</em>
        <div className="dm-lane" style={{ gridArea: '3 / 2' }}>
          <b className="dm-seg" style={{ left: '60%', width: '22%', ...delay(6.6) }} />
        </div>
        <div className="dm-pin-track" style={{ gridArea: '1 / 2 / 4 / 3' }}>
          <span className="dm-pin" style={{ left: '40%' }}>
            <span className="dm-thumb"><Slide grow={false} /></span>
            <i />
          </span>
        </div>
      </div>
      <div className="dm-quotes">
        <p style={delay(6.9)}><small>Meeting audio · 0:02</small>“…but the product arrives too late.”</p>
        <p style={delay(7.3)}><small>You · 0:15</small>“I’ll move the product into the first three seconds.”</p>
      </div>
    </div>
  );
}

/* ── Scene 3 · Transcript & notes ───────────────────────────────────────────── */

function NotesScene() {
  return (
    <div className="dm-paper">
      <aside className="dm-side">
        <span className="dm-side-mark"><Wordmark /></span>
        <span className="lp-label">Meetings</span>
        <span className="is-on">Autumn campaign review<small>Today · 24 min</small></span>
        <span>Client readout<small>Fri · 41 min</small></span>
        <span>Weekly creative sync<small>Thu · 18 min</small></span>
      </aside>
      <div className="dm-doc">
        <div className="dm-doc-top"><span>September 28 · 24 min</span><span>Saved on this device</span></div>
        <h3>Autumn campaign review</h3>
        <div className="dm-doc-tabs">
          <span className="dm-doc-tab dm-doc-tab-t">Transcript</span>
          <span className="dm-doc-tab dm-doc-tab-n">Notes<Cursor at={3.9} /></span>
        </div>

        <div className="dm-panes">
          <div className="dm-pane dm-pane-transcript dm-life dm-transient" style={life(0, 4.8)}>
            <div className="dm-in" style={delay(0.4)}><small>Meeting audio · 0:02</small><p>The new opening holds attention longer, but the product arrives too late.</p></div>
            <figure className="dm-in dm-doc-shot" style={delay(1.1)}>
              <Slide />
              <figcaption>0:10 · Screenshot</figcaption>
            </figure>
            <div className="dm-in" style={delay(1.9)}><small>You · 0:15</small><p>I’ll move the product into the first three seconds and send a revised cut on Thursday.</p></div>
            <div className="dm-in" style={delay(2.6)}><small>Meeting audio · 0:28</small><p>Keep the warm color treatment, and put the revision next to Variant B.</p></div>
          </div>

          <div className="dm-pane dm-pane-blank dm-life dm-transient" style={life(4.8, 6.3)}>
            <p>A blank page for your own notes.</p>
            <span className="dm-write">Write notes<Cursor at={4.9} /></span>
          </div>

          <div className="dm-pane dm-pane-writing dm-life dm-transient" style={life(6.3, 7.9)}>
            <small>Writing notes on this Mac…</small>
            <i style={{ width: '38%' }} /><i style={{ width: '92%' }} /><i style={{ width: '74%' }} />
            <i style={{ width: '30%', marginTop: '1.4em' }} /><i style={{ width: '86%' }} />
          </div>

          <div className="dm-pane dm-pane-notes">
            <small className="dm-in" style={delay(7.9)}>Written on this Mac · editable</small>
            <h4 className="dm-in" style={delay(8.1)}>Creative direction</h4>
            <p className="dm-in" style={delay(8.3)}>Move the product into the first three seconds of the revised cut.</p>
            <span className="dm-in dm-source" style={delay(8.5)}>
              Source ↗ · You, 0:15
              <Cursor at={9.9} stay />
            </span>
            <h4 className="dm-in" style={delay(8.8)}>For the next review</h4>
            <p className="dm-in" style={delay(9)}>Keep the warm color treatment and compare the revised opening with Variant B.</p>
            <span className="dm-in dm-source" style={delay(9.2)}>Source ↗ · Meeting audio, 0:28</span>
            {/* Its own column, beside the notes rather than over them. */}
            <span className="dm-popover">
              <small>Source · You, 0:15</small>
              “I’ll move the product into the first three seconds and send a revised cut on Thursday.”
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PauseIcon() {
  return <svg viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="2.6" height="9" rx=".6" /><rect x="7.4" y="1.5" width="2.6" height="9" rx=".6" /></svg>;
}
function PlayIcon() {
  return <svg viewBox="0 0 12 12" aria-hidden><path d="M3 1.6v8.8L10.4 6z" /></svg>;
}
