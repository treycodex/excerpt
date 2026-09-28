import { useEffect, useRef, useState } from 'react';
import { Wordmark } from './Wordmark';
import './landing.css';

const SOURCE = 'https://github.com/treycodex/excerpt';
/** Always the newest release's disk image; the file keeps one name across releases. */
const DOWNLOAD = `${SOURCE}/releases/latest/download/Excerpt.dmg`;
const REQUIRES = 'macOS 26 or later on Apple silicon';

/** Excerpt is not notarized, so the first open goes through Privacy & Security. */
const INSTALL = [
  ['01', 'Drag it into Applications.',
    'Open Excerpt.dmg and drag Excerpt onto the Applications folder beside it.'],
  ['02', 'Open it once, and choose Done.',
    'macOS says Apple could not verify that Excerpt is free of malware, and does not open it. Choose Done, not Move to Trash.'],
  ['03', 'Choose Open Anyway.',
    'In System Settings → Privacy & Security, scroll to Security. Beside “Excerpt” was blocked to protect your Mac, click Open Anyway and confirm with your password. After that it opens normally.'],
] as const;

/* ── The page ──────────────────────────────────────────────────────────────────
   Structured the way a modern product page is structured — a centred hero, one
   large product frame you can switch, then eyebrow → heading → cards, repeated —
   because that shape is what a reader arriving from a link already knows how to
   read. What fills it is ours: the near-black ground, the paper cream, the mono
   chrome, the serif turn at the end of a sentence, and the four corner brackets
   that mark the active frame everywhere else in the product.

   Every claim on this page is one the product can keep. The sections that say
   what Excerpt does *not* do are not hedging; they are the argument. */

/** The three things the hero can show. Tabs switch the frame, nothing else. */
type Shot = {
  id: string; tab: string; chrome: string; caption: string;
  src?: string; alt?: string; height?: number; video?: boolean;
};

const SHOTS: readonly [Shot, Shot, Shot] = [
  {
    id: 'review',
    tab: 'The transcript',
    chrome: 'EXAMPLE MEETING · TRANSCRIPT & SCREENSHOTS',
    caption: 'Captured screens sit on the meeting clock, with the speech from either side of them.',
  },
  {
    id: 'notes',
    tab: 'The notes',
    chrome: 'EXAMPLE MEETING · OPTIONAL NOTES',
    caption: 'Write notes when you want them. Edit the wording and follow a source back to the transcript.',
  },
  {
    id: 'subtitles',
    tab: 'The subtitles',
    chrome: 'LIVE · TWO LINES · BROKEN ON PHRASE',
    caption: 'Film-style subtitles while the review happens, so you can watch the work.',
    video: true,
  },
];

/** The job, in the order it happens. */
const STEPS = [
  ['01', 'Capture the screen you are reviewing.',
    'On the Mac, a keyboard shortcut grabs the region on screen — a report, a creative, a deck — and places it on the meeting clock.',
    'Mac shortcut · local capture'],
  ['02', 'Keep the discussion beside it.',
    'Each screen is placed on the meeting clock, so the speech from either side of it sits with the picture. Nearby speech is context, not a claim that those words describe what is on screen.',
    'Placed on the meeting clock'],
  ['03', 'Write the next step, and come back to it.',
    'End the meeting to read its transcript. Correct a misheard line, write your own notes, or choose Write notes for a shorter document. Export the conversation and screenshots together.',
    'Yours to keep'],
] as const;

/** cap-style chip grid: a short label and the one line that earns it. */
const KEPT = [
  ['Transcript first', 'Read what was actually said'],
  ['Optional notes', 'Generate them when you choose'],
  ['Your own writing', 'An editable page alongside the transcript'],
  ['Screens on the clock', 'Placed where they happened'],
  ['Transcript corrections', 'Fix a passage; keep the original'],
  ['Markdown and HTML', 'Keep the conversation and its images'],
] as const;

const WHY = [
  ['Open the conversation.', 'Ending a meeting takes you straight to the transcript, with screenshots in time order. A summary is always optional.'],
  ['Keep the useful screen.', 'Use Capture moment, paste or drop an image, or enable imports from macOS screenshot shortcuts during a meeting.'],
  ['Write when you are ready.', 'Take your own notes during the call. Afterwards, choose Write notes for a shorter document based on the transcript.'],
  ['Follow the source.', 'Generated notes link to their transcript passages. Correct a misheard line and keep the original wording in its history.'],
  ['Choose where notes are written.', 'Use Apple Intelligence on your Mac or select OpenAI with your own key. OpenAI requests send transcript text and screenshot captions when you ask for notes.'],
  ['Keep your meeting files.', 'No account or subscription. Meetings stay on this Mac and export to Markdown or a self-contained HTML document with images.'],
] as const;

const NOT_CLAIMED = [
  ['Not an audio record', 'A transcript is stored, not a recording. You cannot check a note against the original sound.'],
  ['Timing is approximate', 'Live speech recognition reports evolving segments rather than word-perfect source timestamps, so transcript positions can lag real speech.'],
  ['It does not read your report', 'A captured screen is kept as a picture. No numbers are read off it, no metric is verified, no ad platform is connected.'],
  ['It cannot tell who people are', 'Excerpt distinguishes your microphone from meeting audio. It does not identify people by name.'],
] as const;

const SURFACES = [
  ['The Mac app', 'Subtitles drawn over the meeting itself — no browser window and no floating control panel. Excerpt lives in the menu bar.',
    `${REQUIRES}.`, 'Download for Mac ↓', DOWNLOAD],
  ['Local meeting storage', 'Transcripts, captured screens and editable notes stay together in Excerpt’s own folder on your Mac.',
    'No account, backend or browser storage.', 'Read the architecture ↗', `${SOURCE}#readme`],
  ['Open source', 'The capture, transcription, extraction and editor code are all available to inspect and build.',
    'MIT licensed. No subscription.', 'Explore the source ↗', SOURCE],
] as const;

function ProductPreview({ view }: { view: 'transcript' | 'notes' }) {
  return <div className="lp-product-preview" aria-label={`Example meeting ${view}`}>
    <div className="lp-preview-top"><span>September 28 · 24 min</span><span>Saved on this device</span></div>
    <h3>Autumn campaign review</h3>
    <div className="lp-preview-tabs"><span className={view === 'transcript' ? 'active' : ''}>Transcript</span><span className={view === 'notes' ? 'active' : ''}>Notes</span></div>
    {view === 'transcript' ? <>
      <div className="lp-preview-passage"><small>Meeting audio · 0:02</small><p>The new opening holds attention longer, but the product arrives too late.</p></div>
      <figure className="lp-preview-chart"><strong>Creative comparison</strong><div><span>Variant A</span><i style={{width:'46%'}} /></div><div><span>Variant B</span><i style={{width:'62%'}} /></div><div><span>New opening</span><i style={{width:'78%'}} /></div><figcaption>0:10 · Screenshot · Synthetic example</figcaption></figure>
      <div className="lp-preview-passage"><small>You · 0:15</small><p>I’ll move the product into the first three seconds and send a revised cut on Thursday.</p></div>
    </> : <>
      <p className="lp-preview-provenance">Example notes · generated after choosing Write notes</p>
      <h4>Creative direction</h4><p>Move the product into the first three seconds of the revised cut.</p><small className="lp-preview-source">Source ↗ · You, 0:15</small>
      <h4>For the next review</h4><p>Keep the warm color treatment and compare the revised opening with Variant B.</p><small className="lp-preview-source">Source ↗ · Meeting audio, 0:28</small>
      <p className="lp-preview-foot">Editable notes. The full transcript stays one tab away.</p>
    </>}
  </div>;
}

export function Landing({ onStart }: { onStart: () => void }) {
  const [shot, setShot] = useState(0);
  const [stuck, setStuck] = useState(false);
  useReveal();

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });

  const active = SHOTS[shot] ?? SHOTS[0];

  return (
    <div className="lp">
      <nav className={stuck ? 'lp-nav is-stuck' : 'lp-nav'} aria-label="Main">
        <a className="lp-nav-mark" href="#/" aria-label="Excerpt home"><Wordmark /></a>
        <div className="lp-nav-links">
          <button onClick={() => jump('how-it-works')}>How it works</button>
          <button onClick={() => jump('what-it-keeps')}>What it keeps</button>
          <button onClick={() => jump('surfaces')}>How it runs</button>
          <button onClick={() => jump('install')}>Install</button>
          <a href={SOURCE} target="_blank" rel="noreferrer">Open source ↗</a>
        </div>
        <div className="lp-nav-actions">
          <button className="lp-ghost" onClick={onStart}>Watch the demo</button>
          <a className="lp-solid" href={DOWNLOAD}>Download</a>
        </div>
      </nav>

      <header className="lp-hero">
        <a className="lp-pill" href={DOWNLOAD}>
          <span className="lp-pill-new">NEW</span>
          Excerpt for Mac is ready to download, free
          <span aria-hidden>↓</span>
        </a>

        <p className="lp-eyebrow">Meeting memory for creative and media agencies</p>
        <h1><span>The screen.</span> <span>The speech.</span><br /><em>The meeting, kept together.</em></h1>
        <p className="lp-lead">
          One free, open-source app for campaign reviews, creative feedback and client readouts.
          Read the conversation with screenshots beside it. Correct a passage, add your own writing,
          and generate notes only when you want them — all in one Mac app.
        </p>

        <div className="lp-cta">
          <a className="lp-solid lp-lg" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
          <button className="lp-outline lp-lg" onClick={onStart}><span aria-hidden>▷</span> Watch the captions demo</button>
        </div>
        <p className="lp-fineprint">Free. Requires {REQUIRES}. The first time you open it, macOS asks you to allow it — <button className="lp-text lp-inline" onClick={() => jump('install')}>here is how</button>.</p>
        <p className="lp-fineprint">No account, no subscription. Capture, transcription and meeting files stay on your Mac.</p>

        <div className="lp-also">
          <span className="lp-label">Built around</span>
          <span>Menu-bar app</span><i aria-hidden>·</i>
          <span>On-device speech</span><i aria-hidden>·</i>
          <span>Local meeting files</span>
        </div>
      </header>

      {/* One frame, three things it can hold. The tabs change the picture and the
          line under it, and nothing else on the page moves. */}
      <section className="lp-showcase" aria-label="Excerpt in use">
        <div className="lp-tabs" role="tablist" aria-label="What to show">
          {SHOTS.map((s, i) => (
            <button key={s.id} role="tab" id={`tab-${s.id}`} aria-selected={i === shot}
              aria-controls="lp-frame" className={i === shot ? 'is-on' : undefined}
              onClick={() => setShot(i)}>{s.tab}</button>
          ))}
        </div>

        <div className="lp-glow" aria-hidden />
        <figure className="lp-frame" id="lp-frame" role="tabpanel" aria-labelledby={`tab-${active.id}`}>
          <div className="lp-frame-bar">
            <span className="lp-frame-mark"><Wordmark markOnly /></span>
            <span className="lp-label">{active.chrome}</span>
            <span className="lp-frame-clock">0:41</span>
          </div>
          <div className="lp-frame-media">
            {active.video
              ? <ProductFilm />
              : <ProductPreview view={active.id === 'notes' ? 'notes' : 'transcript'} />}
            <span className="lp-brackets" aria-hidden><i /><i /><i /><i /></span>
          </div>
          <figcaption>{active.caption}</figcaption>
        </figure>
      </section>

      <section className="lp-section cs-reveal" id="how-it-works">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ How it works ]</span>
          <h2>A review you can <em>open again.</em></h2>
          <p>Three steps, and the third one is the point: a week later the decision still has the report it was made about sitting next to it.</p>
        </div>
        <div className="lp-cards lp-cards-3">
          {STEPS.map(([n, title, body, meta]) => (
            <article className="lp-card" key={n}>
              <span className="lp-step">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className="lp-label lp-card-meta">{meta}</span>
            </article>
          ))}
        </div>
        <p className="lp-note">
          A captured report is kept as a picture and the conversation as a transcript. Excerpt does not
          read the numbers off a report, verify a metric, import spreadsheets or PDFs, or connect to an
          ad platform.
        </p>
      </section>

      <section className="lp-section lp-split cs-reveal" id="what-it-keeps">
        <div className="lp-split-copy">
          <span className="lp-label lp-label-ember">[ After the review ]</span>
          <h2>The transcript first.<br /><em>Notes when you want them.</em></h2>
          <p>
            Your meeting opens as a transcript, with screenshots where they were captured. Read it,
            correct a misheard line, or add an image without generating anything.
          </p>
          <p>
            The Notes tab gives you a blank page or an explicit Write notes action. Generated wording
            stays editable, with source passages close by. Your own writing is kept when notes are rewritten.
          </p>
          <div className="lp-split-actions">
            <button className="lp-outline" onClick={onStart}>See it in the demo <span aria-hidden>↗</span></button>
            <a className="lp-text" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
          </div>
        </div>
        <figure className="lp-split-shot">
          <ProductPreview view="notes" />
        </figure>
      </section>

      <div className="lp-chips cs-reveal">
        {KEPT.map(([label, line]) => (
          <div className="lp-chip" key={label}><strong>{label}</strong><span>{line}</span></div>
        ))}
      </div>

      <section className="lp-section lp-centred cs-reveal">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Why Excerpt ]</span>
          <h2>A meeting you can <em>return to.</em></h2>
          <p>Keep the original conversation within reach, from the first caption to the exported meeting.</p>
        </div>
        <div className="lp-cards lp-cards-3">
          {WHY.map(([title, body]) => (
            <article className="lp-card lp-card-quiet" key={title}><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-centred cs-reveal" aria-labelledby="subs-title">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ During the review ]</span>
          <h2 id="subs-title">And while it happens, <em>subtitles.</em></h2>
          <p>Two-line captions follow the conversation over your meeting window. Choose their look and position, or turn them off while the transcript keeps recording.</p>
        </div>
        <div className="lp-film-wrap">
          <div className="lp-glow" aria-hidden />
          <div className="lp-film">
            <ProductFilm />
            <span className="lp-brackets" aria-hidden><i /><i /><i /><i /></span>
          </div>
          <div className="lp-film-credit">
            <span className="lp-label">Real product footage · Excerpt in session</span>
            <button className="lp-text" onClick={onStart}>Watch captions <span aria-hidden>↗</span></button>
          </div>
        </div>
      </section>

      <section className="lp-section lp-centred cs-reveal">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ What Excerpt does not claim ]</span>
          <h2>The limits, <em>up front.</em></h2>
          <p>Stated here rather than discovered later, because a tool whose whole argument is “check it yourself” has to say what cannot be checked.</p>
        </div>
        <div className="lp-cards lp-cards-4">
          {NOT_CLAIMED.map(([title, body]) => (
            <article className="lp-card lp-card-outline" key={title}><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="lp-paper cs-reveal">
        <span className="lp-label lp-label-ink">[ Free and open source ]</span>
        <h2>Your review.<br /><em>Your device.</em></h2>
        <div className="lp-cards lp-cards-3">
          <article className="lp-card lp-card-paper">
            <h3>Free to use.</h3>
            <p>No account and no subscription. Notes and captured screens stay in the Mac app’s own folder, ready to export.</p>
          </article>
          <article className="lp-card lp-card-paper">
            <h3>Transcription stays local.</h3>
            <p>Apple’s speech frameworks transcribe on your Mac. Finish setup and install the speech model before starting your first meeting.</p>
          </article>
          <article className="lp-card lp-card-paper">
            <h3>Notes are optional.</h3>
            <p>Choose Write notes to use Apple Intelligence on your Mac, or OpenAI with your own key. OpenAI receives transcript text and screenshot captions and is billed to you; screenshot pixels stay local.</p>
          </article>
        </div>
        <div className="lp-trust">
          <div><span className="lp-label lp-label-ink">MIT licensed</span><p>Every line on GitHub. Fork it, audit it, or build the Mac app yourself.</p></div>
          <div><span className="lp-label lp-label-ink">On-device speech</span><p>Apple’s speech frameworks transcribe locally in the Mac app.</p></div>
          <div><span className="lp-label lp-label-ink">No lock-in</span><p>Notes export as Markdown, or as one self-contained HTML page with the screens in it.</p></div>
          <div><span className="lp-label lp-label-ink">No account</span><p>There is nothing to sign up for, and nothing to cancel.</p></div>
        </div>
        <p className="lp-paper-note">Read the code or build Excerpt yourself. <a href={SOURCE} target="_blank" rel="noreferrer">Explore the source ↗</a></p>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="surfaces">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ How it runs ]</span>
          <h2>Capture, captions, notes — <em>one Mac app.</em></h2>
          <p>Excerpt hears the meeting through native macOS capture, draws subtitles over it, and keeps the transcript, captured screens and editable notes together locally.</p>
        </div>
        <div className="lp-cards lp-cards-3">
          {SURFACES.map(([title, body, req, cta, href]) => (
            <article className="lp-card lp-surface" key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className="lp-label lp-card-meta">{req}</span>
              {cta && href
                ? <a className="lp-outline lp-full" href={href} {...(href.startsWith('http') && href !== DOWNLOAD ? { target: '_blank', rel: 'noreferrer' } : {})}>{cta}</a>
                : <button className="lp-outline lp-full" onClick={onStart}>Watch the demo ↗</button>}
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="install">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Install ]</span>
          <h2>Opening it <em>the first time.</em></h2>
          <p>Excerpt is signed but not notarized by Apple, which costs a paid developer account, so macOS stops the first launch with a malware warning. The code is open for anyone to check. Allowing it takes three steps, once.</p>
        </div>
        <div className="lp-cards lp-cards-3">
          {INSTALL.map(([n, title, body]) => (
            <article className="lp-card lp-card-outline" key={n}>
              <span className="lp-step">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <p className="lp-note">
          Open Anyway appears for about an hour after step 2; if it is gone, open Excerpt again. Right-clicking and
          choosing Open no longer skips this check on current macOS. Would rather not? <a className="lp-link" href={SOURCE} target="_blank" rel="noreferrer">Build it from source ↗</a>
        </p>
        <div className="lp-cta lp-cta-centred">
          <a className="lp-solid lp-lg" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
        </div>
      </section>

      <section className="lp-final cs-reveal">
        <span className="lp-label lp-label-ember">For your next campaign review</span>
        <h2>Keep the work, the numbers,<br /><em>and the conversation.</em></h2>
        <div className="lp-cta lp-cta-centred">
          <a className="lp-solid lp-lg" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
          <button className="lp-outline lp-lg" onClick={onStart}><span aria-hidden>▷</span> Watch the demo</button>
        </div>
        <p className="lp-fineprint">No account. No credit card. No subscription. {REQUIRES}.</p>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-cols">
          <div className="lp-footer-brand">
            <a href="#/" aria-label="Excerpt home"><Wordmark /></a>
            <p>Meeting memory for creative and media agencies. Free, open source, and stored on your own device.</p>
          </div>
          <div>
            <span className="lp-label">Product</span>
            <a href={DOWNLOAD}>Download for Mac ↓</a>
            <button className="lp-text" onClick={() => jump('install')}>Install</button>
            <a href={`${SOURCE}#readme`} target="_blank" rel="noreferrer">Documentation ↗</a>
            <button className="lp-text" onClick={onStart}>The demo</button>
          </div>
          <div>
            <span className="lp-label">The page</span>
            <button className="lp-text" onClick={() => jump('how-it-works')}>How it works</button>
            <button className="lp-text" onClick={() => jump('what-it-keeps')}>What it keeps</button>
            <button className="lp-text" onClick={() => jump('surfaces')}>How it runs</button>
          </div>
          <div>
            <span className="lp-label">Source</span>
            <a href={SOURCE} target="_blank" rel="noreferrer">GitHub ↗</a>
            <a href={`${SOURCE}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT licence ↗</a>
            <a href={`${SOURCE}#readme`} target="_blank" rel="noreferrer">Read the docs ↗</a>
          </div>
        </div>
        <div className="lp-wordmark" aria-hidden>excerpt<span>✳</span></div>
        <div className="lp-footer-base">
          <span>© {new Date().getFullYear()} Excerpt · MIT</span>
          <span>Built for The Build Games.</span>
          <span>Free and open source.</span>
        </div>
      </footer>
    </div>
  );
}

/* Sections arrive rather than appear. Reduced motion gets them already arrived —
   the class is added immediately, so nothing depends on an observer that will
   never fire. */
function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.cs-reveal'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

function ProductFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { if (query.matches) video.current?.pause(); else void video.current?.play().catch(() => {}); };
    sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return (
    <div className="lp-video">
      <video ref={video} poster="/media/meeting-poster.jpg" muted loop playsInline preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        aria-label="Excerpt demonstration with live meeting subtitles">
        <source src="/media/meeting.webm" type="video/webm" />
        <source src="/media/meeting.mp4" type="video/mp4" />
      </video>
      <button className="lp-video-toggle"
        onClick={() => { if (playing) video.current?.pause(); else void video.current?.play().catch(() => {}); }}
        aria-label={playing ? 'Pause product video' : 'Play product video'}>
        {playing ? 'Ⅱ Pause' : '▷ Play'}
      </button>
    </div>
  );
}
