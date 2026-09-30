import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Wordmark } from './Wordmark';
import './landing.css';
import { Showcase } from './Showcase';
import { CommandLine, InstallMethods } from './Install';
import { Icon, IconTile, type IconName } from '@excerpt/ui';
import { BUILD_GAMES, DOWNLOAD, INSTALL_COMMAND, REQUIRES, SOURCE } from './site';

/* ── The page ──────────────────────────────────────────────────────────────────
   A modern product page in Excerpt's own material: near-black ground, paper
   cream, mono chrome, a serif turn at the end of a heading, and the four ember
   corner brackets that mark an active frame everywhere in the product. The
   cinema set dressing (letterbox, grain, the projector beam, the film-strip reel,
   the slate numbers) is the product's idea carried into the page: meetings with
   subtitles.

   Every claim here is one the product keeps. The fine-print section says what
   Excerpt does not do, in plain words, because that is the argument. */

/** Staggered children: each card arrives a beat after the one before it. */
const beat = (i: number) => ({ '--i': i }) as CSSProperties;

/** The feature reel, as it scrolls past under the hero. */
const REEL: readonly [IconName, string][] = [
  ['subtitles', 'Live subtitles'],
  ['viewfinder', 'Capture moment'],
  ['strip', 'Meeting timeline'],
  ['script', 'Transcript first'],
  ['playhead', 'Notes linked to sources'],
  ['retake', 'Fix a misheard line'],
  ['rewind', 'Catch up'],
  ['clapper', 'Your own notes'],
  ['spark', 'Apple Intelligence'],
  ['code', 'Your own OpenAI key'],
  ['canister', 'Markdown and HTML export'],
  ['mic', 'On-device speech'],
  ['seat', 'No account'],
  ['reel', 'Open source'],
];

/** The job, in the order it happens. */
const STEPS: readonly [IconName, string, string, string][] = [
  ['viewfinder', 'Save what’s on screen.',
    'Press ⌘⇧S to capture a slide, design, or report. Excerpt places it on the meeting timeline when you take it.',
    '⌘⇧S · saved on your Mac'],
  ['strip', 'Keep the words around it.',
    'See what was said before and after each capture, right beside the image. Excerpt shows the context without guessing what the image means.',
    'Placed on the meeting timeline'],
  ['clapper', 'Find it again later.',
    'Open the transcript after the meeting. Correct a line, write your own notes, or generate a short version. Export the record when you need it.',
    'Yours to keep'],
];

/** Who shows work on a shared screen, and what each of them needs afterwards. */
const PEOPLE: readonly [IconName, string, string][] = [
  ['camera', 'Creative leads', 'Keep feedback beside the cut it was about, ready for the next round.'],
  ['storyboard', 'Designers', 'Capture the frame or layout under discussion, with the conversation beside it.'],
  ['projector', 'Media planners and buyers', 'Save the report view and the reasoning behind a budget decision.'],
  ['chart', 'Performance marketers', 'Keep the numbers shown on screen beside the test the team agreed to run.'],
  ['megaphone', 'Account leads', 'Find client questions, caveats, and approvals next to the relevant slide.'],
  ['chair', 'Strategists', 'Return to the words behind a decision when it is time to write the brief.'],
];

const KEPT: readonly [IconName, string, string][] = [
  ['script', 'Transcript first', 'Read what was actually said'],
  ['clapper', 'Optional notes', 'Only written when you ask'],
  ['storyboard', 'Your own writing', 'An editable page beside the transcript'],
  ['strip', 'Screens on the timeline', 'Placed where they happened'],
  ['retake', 'Corrections', 'Fix a line and keep the original'],
  ['canister', 'Markdown and HTML', 'Take the words and the pictures with you'],
];

const LIMITS: readonly [IconName, string, string][] = [
  ['mic', 'No audio recording', 'Excerpt saves a transcript, not a recording. You cannot play the sound back to check a line.'],
  ['strip', 'Timing is approximate', 'Live speech recognition can run a little behind, so a timestamp may lag what was said.'],
  ['viewfinder', 'It does not read your reports', 'A screenshot is saved as a picture. Excerpt does not read numbers off it, check a metric, or connect to ad platforms.'],
  ['seat', 'It does not know names', 'It can tell your microphone apart from the meeting audio. It cannot tell who is speaking.'],
];

const INCLUDED = [
  'Every feature included',
  'No account or subscription',
  'Meetings saved on your Mac',
  'Markdown and HTML export',
  'MIT-licensed source code',
] as const;

const FAQ: readonly [string, string][] = [
  ['What is Excerpt?',
    'A free, open-source Mac app for meetings. It shows live captions, saves the parts of the screen you choose, and puts those captures beside the transcript afterward.'],
  ['How is it different from Granola or Tactiq?',
    'Excerpt takes a smaller, Mac-first approach: live captions, screen captures, a locally saved transcript, and optional notes. It does not try to match every feature or team workflow in Granola or Tactiq.'],
  ['Does it record audio?',
    'No. It turns speech into text as the meeting happens and keeps only the text. No audio file is saved.'],
  ['Which meeting apps does it work with?',
    'Any of them. Excerpt listens to your Mac’s sound and your microphone, so there is nothing to add to Zoom, Google Meet or Teams, and no bot joins the call.'],
  ['Where are my meetings stored?',
    'In Excerpt’s folder on your Mac. You do not need an account or browser storage.'],
  ['Does anything leave my Mac?',
    'Only if you ask. Transcription runs on your Mac. If you choose Write notes with OpenAI, the transcript text and screenshot captions go to OpenAI on your own key. The screenshot images stay on your Mac.'],
  ['Do I need an OpenAI key?',
    'No. Notes are optional. On a Mac with Apple Intelligence, notes can be written on the device. You can also write your own notes, or simply read the transcript.'],
  ['Can other people see the subtitles?',
    'They can if the subtitles are on the screen you share. Captions can appear in screen recordings and screen shares, so check your meeting app’s preview, or turn them off with ⌘⇧C.'],
  ['Why does macOS warn me the first time?',
    'Excerpt is locally signed but not notarized by Apple. A browser download needs one approval in System Settings. The install guide explains both the download and Terminal options.'],
  ['What do I need to run it?',
    'A Mac with Apple silicon on macOS 26 or later. Setup installs Apple’s speech model before your first meeting.'],
  ['Is it really free?',
    'Yes. No subscription, no account and no paid tier. The code is MIT licensed, so you can read it or build it yourself.'],
];

function ProductPreview() {
  return <div className="lp-product-preview" aria-label="Example meeting notes">
    <div className="lp-preview-top"><span>September 28 · 24 min</span><span>Saved on this device</span></div>
    <h3>Autumn campaign review</h3>
    <div className="lp-preview-tabs"><span>Transcript</span><span className="active">Notes</span></div>
    <p className="lp-preview-provenance">Example notes · written after choosing Write notes</p>
    <h4>Creative direction</h4><p>Move the product into the first three seconds of the revised cut.</p><small className="lp-preview-source">Source ↗ · You, 0:15</small>
    <h4>For the next review</h4><p>Keep the warm color treatment and compare the revised opening with Variant B.</p><small className="lp-preview-source">Source ↗ · Meeting audio, 0:28</small>
    <p className="lp-preview-foot">Editable notes. The full transcript is one tab away.</p>
  </div>;
}

export function Landing({ onStart }: { onStart: () => void }) {
  const [stuck, setStuck] = useState(false);
  useReveal();
  useSpotlight();

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });

  return (
    <div className="lp">
      {/* Set dressing: the letterbox opens once on arrival, and a fine grain sits over everything. */}
      <div className="lp-letterbox" aria-hidden><i /><i /></div>
      <div className="lp-grain" aria-hidden />

      <nav className={stuck ? 'lp-nav is-stuck' : 'lp-nav'} aria-label="Main">
        <a className="lp-nav-mark" href="#/" aria-label="Excerpt home"><Wordmark /></a>
        <div className="lp-nav-links">
          <button onClick={() => jump('how-it-works')}>How it works</button>
          <button onClick={() => jump('features')}>Features</button>
          <button onClick={() => jump('who')}>Who it’s for</button>
          <button onClick={() => jump('pricing')}>Pricing</button>
          <button onClick={() => jump('faq')}>FAQ</button>
        </div>
        <div className="lp-nav-actions">
          <button className="lp-ghost" onClick={onStart}>Watch the demo</button>
          <a className="lp-solid" href={DOWNLOAD}>Download</a>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-beam" aria-hidden />
        <a className="lp-pill lp-rise" style={beat(0)} href={BUILD_GAMES} target="_blank" rel="noreferrer">
          <span className="lp-pill-new">SUBMISSION</span>
          The Build Games
          <span aria-hidden>↗</span>
        </a>

        <p className="lp-eyebrow lp-rise" style={beat(1)}><Icon name="clapper" /> An open-source Mac alternative to Granola and Tactiq</p>
        <h1 className="lp-rise" style={beat(2)}><span>The full picture.</span><br /><em>Not just the transcript.</em></h1>
        <p className="lp-lead lp-rise" style={beat(3)}>
          Excerpt adds live captions to meetings, saves the moments you capture on screen, and keeps
          them beside the transcript afterward. Add your own notes or generate them later.
          Free, with no account or subscription.
        </p>

        <div className="lp-cta lp-rise" style={beat(4)}>
          <a className="lp-solid lp-lg" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
          <button className="lp-outline lp-lg" onClick={onStart}><span aria-hidden>▷</span> Watch the 54-second demo</button>
        </div>
        <figure className="lp-demo-preview lp-rise" style={beat(5)}>
          <button className="lp-demo-play" type="button" onClick={onStart} aria-label="Watch the 54-second Excerpt video demo">
            <span className="lp-demo-copy">
              <span className="lp-demo-kicker">Excerpt in action</span>
              <strong>A meeting.<br />The full picture.</strong>
              <span className="lp-demo-description">Captions, captures, and the context worth keeping.</span>
              <span className="lp-demo-watch"><span className="lp-demo-play-icon" aria-hidden>▶</span> Watch the film <span className="lp-demo-duration">0:54</span></span>
            </span>
            <span className="lp-demo-still">
              <img src="/media/excerpt-demo-preview.jpg" alt="" width="1920" height="1080" fetchPriority="high" />
            </span>
          </button>
          <figcaption>Real app footage · Scripted meeting with synthetic voices</figcaption>
        </figure>
        <div className="lp-hero-cmd lp-rise" style={beat(5)}>
          <span className="lp-label">Prefer Terminal? Read the script, then install with one line.</span>
          <CommandLine command={INSTALL_COMMAND} label="Terminal install command" />
        </div>

        <ul className="lp-trustrow lp-rise" style={beat(6)} aria-label="At a glance">
          <li><Icon name="ticket" /> Free, no account</li>
          <li><Icon name="seat" /> Meetings saved on your Mac</li>
          <li><Icon name="laptop" /> macOS 26 or later, Apple silicon</li>
        </ul>
        <p className="lp-fineprint lp-rise" style={beat(7)}>
          Excerpt is locally signed but not notarized by Apple. Browser downloads need one approval in System Settings. <a className="lp-inline" href="#/install">Install guide</a>
        </p>
      </header>

      <FeatureReel />

      {/* One frame, three scenes, played in the order a meeting has them. */}
      <Showcase />

      <section className="lp-section cs-reveal" id="how-it-works">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ How it works ]</span>
          <h2>Three scenes. <em>One record.</em></h2>
          <p>A screenshot misses what people said. A transcript misses what they saw. Excerpt keeps both on one timeline.</p>
        </div>
        <div className="lp-steps">
          <div className="lp-steps-track" aria-hidden><i /></div>
          {STEPS.map(([icon, title, body, meta], i) => (
            <article className="lp-card lp-step-card" key={title} style={beat(i)}>
              <div className="lp-step-top">
                <IconTile name={icon} />
                <span className="lp-slate">SCENE <b>0{i + 1}</b></span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className="lp-label lp-card-meta">{meta}</span>
            </article>
          ))}
        </div>
        <p className="lp-note">
          Screen captures are pictures, not analyzed reports. Excerpt does not read numbers from them,
          check metrics, import spreadsheets or PDFs, or connect to ad platforms.
        </p>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="features">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Features ]</span>
          <h2>Useful in the meeting. <em>Useful after.</em></h2>
          <p>Captions and quick screen capture while you talk. An editable transcript and notes when you are done.</p>
        </div>
        <Bento />
      </section>

      <section className="lp-section lp-split cs-reveal" id="what-it-keeps">
        <div className="lp-split-copy">
          <span className="lp-label lp-label-ember">[ After the review ]</span>
          <h2>The transcript first.<br /><em>Notes when you want them.</em></h2>
          <p>
            Open a meeting to see the full transcript, with each capture where it happened.
            Correct a misheard line or add an image. Nothing is generated until you ask.
          </p>
          <p>
            Start with a blank notes page, or choose Write notes for a shorter version.
            Generated notes link to their source in the transcript. They stay editable, and your
            writing remains if you generate notes again.
          </p>
          <div className="lp-split-actions">
            <button className="lp-outline" onClick={onStart}>See it in the demo <span aria-hidden>↗</span></button>
            <a className="lp-text" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
          </div>
        </div>
        <figure className="lp-split-shot">
          <ProductPreview />
          <span className="lp-brackets" aria-hidden><i /><i /><i /><i /></span>
        </figure>
      </section>

      <div className="lp-chips cs-reveal">
        {KEPT.map(([icon, label, line], i) => (
          <div className="lp-chip" key={label} style={beat(i)}>
            <Icon name={icon} />
            <div><strong>{label}</strong><span>{line}</span></div>
          </div>
        ))}
      </div>

      <section className="lp-section lp-centred cs-reveal" id="who">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Who it’s for ]</span>
          <h2>For work shown <em>on screen.</em></h2>
          <p>When a meeting turns on a slide, a design, or a report, keep that moment with the conversation.</p>
        </div>
        <div className="lp-cards lp-cards-3">
          {PEOPLE.map(([icon, title, body], i) => (
            <article className="lp-card lp-person" key={title} style={beat(i)}>
              <IconTile name={icon} />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-centred cs-reveal" aria-labelledby="subs-title">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ During the review ]</span>
          <h2 id="subs-title">See the words <em>as they happen.</em></h2>
          <p>Live captions sit over your meeting window. Pick their look and position, or hide them. The transcript keeps going.</p>
        </div>
        <div className="lp-film-wrap">
          <div className="lp-glow" aria-hidden />
          <div className="lp-film">
            <ProductFilm />
            <span className="lp-brackets" aria-hidden><i /><i /><i /><i /></span>
          </div>
          <div className="lp-film-credit">
            <span className="lp-label"><b className="lp-rec" aria-hidden /> Real product footage · Excerpt in a meeting</span>
            <button className="lp-text" onClick={onStart}>Watch captions <span aria-hidden>↗</span></button>
          </div>
        </div>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="limits">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ The fine print ]</span>
          <h2>What it <em>won’t do.</em></h2>
          <p>Excerpt keeps the record. It does not pretend to understand everything in it.</p>
        </div>
        <div className="lp-cards lp-cards-4">
          {LIMITS.map(([icon, title, body], i) => (
            <article className="lp-card lp-card-outline lp-limit" key={title} style={beat(i)}>
              <span className="lp-limit-icon"><Icon name={icon} /><Icon name="cut" className="lp-limit-cut" /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-paper cs-reveal" id="pricing">
        <div className="lp-paper-head">
          <span className="lp-label lp-label-ink">[ Pricing ]</span>
          <h2>Free to use.<br /><em>Open to inspect.</em></h2>
          <p>No trial, account, or paid tier. Download the app or build it from the MIT-licensed source.</p>
        </div>
        <div className="lp-price">
          <article className="lp-ticket">
            <div className="lp-ticket-main">
              <span className="lp-ticket-kicker"><Icon name="ticket" /> Admit one</span>
              <h3>Excerpt for Mac</h3>
              <div className="lp-ticket-price"><span>$</span>0</div>
              <p className="lp-ticket-sub">The whole app is free. The source is MIT licensed.</p>
              <ul>
                {INCLUDED.map((line, i) => <li key={line} style={beat(i)}><Icon name="check" /> {line}</li>)}
              </ul>
              <a className="lp-solid lp-lg lp-ticket-cta" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
              <p className="lp-ticket-fine">{REQUIRES}.</p>
            </div>
            <div className="lp-ticket-stub" aria-hidden>
              <span>EXCERPT</span><span>ROW · FREE</span><span>SEAT · YOURS</span>
            </div>
          </article>
          <div className="lp-price-side">
            <article className="lp-card lp-card-paper">
              <IconTile name="mic" className="ci-tile-ink" />
              <div>
                <h3>Transcription runs on your Mac.</h3>
                <p>Apple’s speech tools turn audio into text on-device. Install the speech model during setup before your first meeting.</p>
              </div>
            </article>
            <article className="lp-card lp-card-paper">
              <IconTile name="spark" className="ci-tile-ink" />
              <div>
                <h3>Notes are optional.</h3>
                <p>Write them yourself, use Apple Intelligence on your Mac, or choose OpenAI with your own key. OpenAI receives transcript text and screenshot captions and bills you directly. Screenshot images stay on your Mac.</p>
              </div>
            </article>
            <article className="lp-card lp-card-paper">
              <IconTile name="reel" className="ci-tile-ink" />
              <div>
                <h3>Open to inspect.</h3>
                <p>Read the code for capture, transcription, notes, and the editor. Fork it, audit it, or build the app yourself.</p>
                <a className="lp-paper-link" href={SOURCE} target="_blank" rel="noreferrer">Explore the source ↗</a>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="install">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Install ]</span>
          <h2>Choose how <em>to install.</em></h2>
          <p>Download the disk image, or read and run the Terminal installer. Excerpt is not notarized, so a browser download needs one approval in macOS.</p>
        </div>
        <InstallMethods guide />
        <p className="lp-note">
          On current macOS, right-clicking and choosing Open no longer skips the check. Prefer neither? <a className="lp-link" href={`${SOURCE}#development`} target="_blank" rel="noreferrer">Build it from source ↗</a>
        </p>
      </section>

      <section className="lp-section cs-reveal" id="faq">
        <div className="lp-faq">
          <div className="lp-head">
            <span className="lp-label lp-label-ember">[ FAQ ]</span>
            <h2>Before you <em>install.</em></h2>
            <p>Answers about privacy, compatibility, and what Excerpt saves. Something missing? <a className="lp-link" href={`${SOURCE}/issues`} target="_blank" rel="noreferrer">Ask on GitHub ↗</a></p>
          </div>
          <div className="lp-faq-list">
            {FAQ.map(([q, a], i) => (
              <details className="lp-faq-item" key={q} style={beat(i)}>
                <summary><span>{q}</span><i aria-hidden /></summary>
                <div className="lp-faq-body"><p>{a}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final cs-reveal">
        <Icon name="reel" className="lp-final-reel" />
        <span className="lp-label lp-label-ember">For your next meeting</span>
        <h2>Keep the screen<br /><em>with the conversation.</em></h2>
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
            <p>Live captions, screen captures, and a local transcript. Free and open source for Mac.</p>
          </div>
          <div>
            <span className="lp-label">Product</span>
            <a href={DOWNLOAD}>Download for Mac ↓</a>
            <a href="#/install">Install guide</a>
            <button className="lp-text" onClick={onStart}>The demo</button>
            <button className="lp-text" onClick={() => jump('pricing')}>Pricing</button>
          </div>
          <div>
            <span className="lp-label">The page</span>
            <button className="lp-text" onClick={() => jump('how-it-works')}>How it works</button>
            <button className="lp-text" onClick={() => jump('features')}>Features</button>
            <button className="lp-text" onClick={() => jump('who')}>Who it’s for</button>
            <button className="lp-text" onClick={() => jump('faq')}>FAQ</button>
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
          <a className="lp-inline" href={BUILD_GAMES} target="_blank" rel="noreferrer">A submission for The Build Games ↗</a>
          <span>Free and open source.</span>
        </div>
      </footer>
    </div>
  );
}

/* ── The feature reel ─────────────────────────────────────────────────────────
   A strip of film running under the hero: sprocket holes above and below, one
   feature per frame. The list is drawn twice so the loop has no seam; the copy
   is hidden from assistive tech, which gets the plain list once. */
function FeatureReel() {
  const frames = (hidden: boolean) => (
    <ul className="lp-reel-run" aria-hidden={hidden || undefined}>
      {REEL.map(([icon, label]) => <li key={label}><Icon name={icon} />{label}</li>)}
    </ul>
  );
  return (
    <div className="lp-reel" aria-label="What Excerpt does">
      <div className="lp-reel-track">{frames(false)}{frames(true)}</div>
    </div>
  );
}

/* ── The bento ────────────────────────────────────────────────────────────────
   Each tile is a feature and a tiny scene of it working. The scenes are CSS
   loops that only run once the section is on screen, and reduced motion holds
   each one on its final frame. */
function Bento() {
  return (
    <div className="bt-grid">
      <article className="bt bt-wide bt-captions" style={beat(0)}>
        <div className="bt-scene" aria-hidden>
          <div className="bt-screen">
            <span className="bt-screen-rec"><b /> LIVE</span>
            <div className="bt-cues">
              <p><span>The new opening holds attention longer,</span><span>but the product arrives too late.</span></p>
              <p><span>So the product moves</span><span>into the first three seconds?</span></p>
              <p><span>Yes. I’ll send a revised cut</span><span>on Thursday.</span></p>
            </div>
          </div>
        </div>
        <div className="bt-copy">
          <h3><Icon name="subtitles" /> Live subtitles <kbd>⌘⇧C</kbd></h3>
          <p>Two-line captions over your meeting window. Move them, change their look, or hide them. The transcript keeps going.</p>
        </div>
      </article>

      <article className="bt bt-capture" style={beat(1)}>
        <div className="bt-scene" aria-hidden>
          <div className="bt-report">
            <i style={{ width: '46%' }} /><i style={{ width: '62%' }} /><i style={{ width: '82%' }} />
            <span className="bt-marquee"><b /><b /><b /><b /></span>
            <span className="bt-flash" />
          </div>
          <span className="bt-stamp">Captured · 0:10</span>
        </div>
        <div className="bt-copy">
          <h3><Icon name="viewfinder" /> Capture moment <kbd>⌘⇧S</kbd></h3>
          <p>Capture part of the screen and place it on the meeting timeline. You can also paste or drop an image.</p>
        </div>
      </article>

      <article className="bt bt-catchup" style={beat(2)}>
        <div className="bt-scene" aria-hidden>
          <div className="bt-seg"><span>30s</span><span className="is-on">60s</span><span>90s</span></div>
          <div className="bt-lines"><i /><i /><i /><i className="bt-live" /></div>
        </div>
        <div className="bt-copy">
          <h3><Icon name="rewind" /> Catch up <kbd>⌘⇧J</kbd></h3>
          <p>Read the last 30, 60, or 90 seconds of speech, then jump back to live.</p>
        </div>
      </article>

      <article className="bt bt-wide bt-notes" style={beat(3)}>
        <div className="bt-scene" aria-hidden>
          <div className="bt-note">
            <small>Creative direction</small>
            <p>Move the product into the first three seconds of the revised cut.</p>
            <span className="bt-source">Source ↗ · You, 0:15</span>
            <span className="bt-quote"><small>You · 0:15</small>“I’ll move the product into the first three seconds and send a revised cut on Thursday.”</span>
          </div>
        </div>
        <div className="bt-copy">
          <h3><Icon name="playhead" /> Notes that show their source</h3>
          <p>Generate a shorter version with Apple Intelligence or your own OpenAI key. Each note links back to its transcript passage.</p>
        </div>
      </article>

      <article className="bt bt-retake" style={beat(4)}>
        <div className="bt-scene" aria-hidden>
          <p className="bt-line">Keep the <s>worm</s> <ins>warm</ins> color treatment.</p>
          <span className="bt-tag"><Icon name="retake" /> Original kept</span>
        </div>
        <div className="bt-copy">
          <h3><Icon name="retake" /> Fix a misheard line</h3>
          <p>Correct a word without losing the original wording.</p>
        </div>
      </article>

      <article className="bt bt-export" style={beat(5)}>
        <div className="bt-scene" aria-hidden>
          <span className="bt-file"><Icon name="script" /> autumn-review.md</span>
          <span className="bt-file"><Icon name="canister" /> autumn-review.html</span>
        </div>
        <div className="bt-copy">
          <h3><Icon name="canister" /> Export</h3>
          <p>Save as Markdown, or as one HTML file with the screenshots inside.</p>
        </div>
      </article>

      <article className="bt bt-start" style={beat(6)}>
        <div className="bt-scene" aria-hidden>
          <div className="bt-menubar">
            <span>Meeting</span><span>View</span>
            <b className="bt-menubar-e">[ e ]<i /></b>
          </div>
          <span className="bt-rec"><b /> Transcript running</span>
        </div>
        <div className="bt-copy">
          <h3><Icon name="record" /> Start from anywhere <kbd>⌘⇧R</kbd></h3>
          <p>When Zoom, Teams, Meet or FaceTime takes the microphone, Excerpt asks whether to start, and asks again before it stops. Or start from the menu bar or the shortcut.</p>
        </div>
      </article>
    </div>
  );
}

/* Sections arrive rather than appear. Reduced motion gets them already arrived:
   the class is added at once, so nothing waits on an observer that never fires. */
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

/* A soft light follows the pointer across cards and tiles, like a follow spot.
   One delegated listener; the card only receives two custom properties. */
function useSpotlight() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.('.lp-card, .bt, .lp-ticket');
      if (!(card instanceof HTMLElement)) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
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
