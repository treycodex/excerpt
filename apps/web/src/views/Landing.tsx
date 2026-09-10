import { useEffect, useRef, useState } from 'react';
import type { CaptionPreset } from '../captionPreset';

const CLAIMS = [
  {
    n: '01',
    title: 'Free, and private',
    body: 'Your Mac does the listening. Nothing is uploaded, no account, no subscription.',
  },
  {
    n: '02',
    title: 'Nothing made up',
    body: 'Every note is something a person actually said, and Excerpt shows you where.',
  },
  {
    n: '03',
    title: 'Wrong sometimes',
    body: 'So you can fix anything in a click. It tells you what it heard, and what it could not tell.',
  },
];

const TICKER = [
  'Decisions', 'Action items', 'Deadlines', 'Open questions',
  'Who agreed to what', 'What you promised', 'What is still unanswered',
];

const LOOKS: { preset: CaptionPreset; name: string; why: string }[] = [
  { preset: 'classic', name: 'Classic', why: 'White, no box. A film subtitle.' },
  { preset: 'warm', name: 'Warm', why: 'Amber with a dark edge. Reads over bright video.' },
  { preset: 'contrast', name: 'High contrast', why: 'On a dark bar. Reads over anything.' },
];

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <HeroFilm onStart={onStart} />

      {/* Genesis-style ticker: what Excerpt looks for, moving slowly. */}
      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <span className="marquee-run" key={copy}>
              {TICKER.map((item) => (
                <span className="marquee-item" key={item}>
                  {item}<i />
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="claims">
        {CLAIMS.map((claim) => (
          <article key={claim.n}>
            <span className="claim-n">{claim.n}</span>
            <h2>{claim.title}</h2>
            <p>{claim.body}</p>
          </article>
        ))}
      </section>

      {/* The three looks, live rather than pictured: these are the real caption
          tokens on real text, so what you see here is exactly what runs. */}
      <section className="showcase looks-section">
        <div className="showcase-copy">
          <span className="eyebrow">Three looks</span>
          <h2>Subtitles, not captions.</h2>
          <p>
            Two lines at most, broken where a phrase ends rather than where the box does,
            fading in and cutting between lines the way film subtitles have always
            worked. Pick the one that survives your meeting.
          </p>
        </div>
        <div className="looks">
          {LOOKS.map((look) => (
            <figure className="look" key={look.preset} data-caption={look.preset}>
              <div className="look-stage">
                <div className="look-line">Let’s move the campaign launch to October.</div>
              </div>
              <figcaption>
                <b>{look.name}</b>
                <span>{look.why}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <Still
        eyebrow="Afterwards"
        title="Notes that point back."
        body="Every line is a verbatim span of something somebody said, with the moment in the audio it came from. Click a note and the transcript scrolls to the passage. Nothing is summarised, because a summary is the part you cannot check."
        src="/media/notes.jpg"
        alt="Excerpt's notes for a meeting: a decision, its evidence quote, and the moment it was said."
        flip
      />

      <Still
        eyebrow="On your Mac"
        title="Nothing to keep open."
        body="Excerpt lives in the menu bar: no Dock icon, no window in the way, no tab to remember. It hears the meeting, draws the subtitles over whatever you are looking at, and writes the notes to a folder on your Mac that you can open yourself."
        src="/media/menubar.jpg"
        alt="Excerpt's setup, finished: start listening, show captions, open notes, and show where notes are kept."
      />

      <section className="closing">
        <h2 className="closing-line">
          Most meeting tools hand you a confident summary you cannot check.
          <span className="closing-em"> This one shows its work.</span>
        </h2>
        <button className="cta" onClick={onStart}>See it in 85 seconds</button>
      </section>
    </div>
  );
}

/**
 * The hero is real footage of the product, not a mock-up: a screen recording of the
 * demo session with its own captions running. `apps/mac/tools/record-hero.sh`
 * regenerates it, so it can be re-shot rather than going quietly out of date.
 *
 * It is treated as film — letterboxed, grained, vignetted, drifting almost
 * imperceptibly — because that is the register, and because a still frame of a dark
 * call is a void while a framed one is a shot.
 */
function HeroFilm({ onStart }: { onStart: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (reduced) { element.pause(); return; }

    /*
     * Autoplay gets refused for reasons that have nothing to do with what the
     * viewer wants: a background tab, a power-saving policy, a browser waiting for
     * a gesture. Treating one refusal as final leaves a frozen frame forever, even
     * after the person switches to the tab — so ask again each time the page could
     * plausibly start playing.
     */
    const attempt = () => { if (!document.hidden) void element.play().catch(() => {}); };
    attempt();
    element.addEventListener('canplay', attempt);
    document.addEventListener('visibilitychange', attempt);
    window.addEventListener('pointerdown', attempt);
    return () => {
      element.removeEventListener('canplay', attempt);
      document.removeEventListener('visibilitychange', attempt);
      window.removeEventListener('pointerdown', attempt);
    };
  }, [reduced]);

  return (
    <section className="hero">
      <div className="film">
        <video
          ref={video}
          className={reduced ? 'film-media' : 'film-media drift'}
          poster="/media/meeting-poster.jpg"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-hidden
        >
          <source src="/media/meeting.webm" type="video/webm" />
          <source src="/media/meeting.mp4" type="video/mp4" />
        </video>
        <div className="film-grain" aria-hidden />
        <div className="film-vignette" aria-hidden />
        <Brackets />
      </div>

      <div className="hero-scrim" aria-hidden />

      <div className="hero-copy">
        <h1>
          Be in the meeting.<br />
          <span className="hero-em">We’ll remember it.</span>
        </h1>
        <p className="lede">
          Beautiful live subtitles while you talk. Afterwards, notes you can actually
          trust — every line points back at what was said.
        </p>
        <div className="cta-row">
          <button className="cta" onClick={onStart}>Watch a meeting</button>
          <a className="cta ghost" href="#/record">Record a real one</a>
        </div>
        <p className="runtime">85 seconds · nothing to install</p>
      </div>
    </section>
  );
}

/**
 * A framed still. Motif 3: selection is four corner brackets, never a border — so the
 * product's own images are framed the way the product frames a moment.
 */
function Still({ eyebrow, title, body, src, alt, flip }: {
  eyebrow: string; title: string; body: string; src: string; alt: string; flip?: boolean;
}) {
  return (
    <section className={flip ? 'showcase flip' : 'showcase'}>
      <div className="showcase-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <figure className="film still">
        <img className="film-media" src={src} alt={alt} loading="lazy" decoding="async" />
        <div className="film-grain" aria-hidden />
        <Brackets />
      </figure>
    </section>
  );
}

function Brackets() {
  return (
    <div className="brackets" aria-hidden>
      <i /><i /><i /><i />
    </div>
  );
}
