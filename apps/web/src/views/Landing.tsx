import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Wordmark } from './Wordmark';
import './landing.css';
import { Showcase } from './Showcase';
import { CommandLine, InstallMethods } from './Install';
import { Icon, IconTile, type IconName } from './CinemaIcons';
import { DOWNLOAD, INSTALL_COMMAND, REQUIRES, SOURCE } from './site';

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
  ['viewfinder', 'Capture what is on screen.',
    'Press ⌘⇧S to grab part of the screen: a report, an ad, a deck. It lands on the meeting timeline at the moment you took it.',
    '⌘⇧S · saved on your Mac'],
  ['strip', 'Keep the talk beside it.',
    'What people said just before and just after sits right next to the picture. It shows what was said around that moment. It does not claim the words describe the image.',
    'Placed on the meeting timeline'],
  ['clapper', 'Come back to it later.',
    'End the meeting and the transcript opens. Fix a misheard line, write your own notes, or choose Write notes for a short version. Export it all when you are done.',
    'Yours to keep'],
];

/** Who shows work on a shared screen, and what each of them needs afterwards. */
const PEOPLE: readonly [IconName, string, string][] = [
  ['camera', 'Creative leads', 'Keep each piece of feedback next to the cut it was about, so the next round starts from what was actually said.'],
  ['storyboard', 'Designers', 'Capture the frame, the layout or the landing page that got a comment, with the comment right beside it.'],
  ['projector', 'Media planners and buyers', 'Save the report view that was on screen, and the reasoning behind the budget change you agreed.'],
  ['chart', 'Performance marketers', 'Keep a picture of the numbers that were shown, how the team read them, and the test you decided to run.'],
  ['megaphone', 'Account leads', 'Client questions, caveats and approvals, each one sitting next to the slide it was about.'],
  ['chair', 'Strategists', 'Why the next round is needed, in the words that decided it, ready to put in the brief.'],
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
  'Every feature, from the first day',
  'No account to create',
  'No subscription to cancel',
  'Transcripts stay on your Mac',
  'Updates: run the install line again',
  'MIT licensed on GitHub',
] as const;

const FAQ: readonly [string, string][] = [
  ['What is Excerpt?',
    'A free Mac app for meetings where work is shown on screen. It puts live subtitles over the call, saves the screenshots you capture, and gives you a transcript with those screenshots in place when the meeting ends.'],
  ['Does it record audio?',
    'No. It turns speech into text as the meeting happens and keeps only the text. No audio file is saved.'],
  ['Which meeting apps does it work with?',
    'Any of them. Excerpt listens to your Mac’s sound and your microphone, so there is nothing to add to Zoom, Google Meet or Teams, and no bot joins the call.'],
  ['Where are my meetings stored?',
    'In Excerpt’s own folder on your Mac. There is no account, no server and no browser storage.'],
  ['Does anything leave my Mac?',
    'Only if you ask. Transcription runs on your Mac. If you choose Write notes with OpenAI, the transcript text and screenshot captions go to OpenAI on your own key. The screenshot images stay on your Mac.'],
  ['Do I need an OpenAI key?',
    'No. Notes are optional. On a Mac with Apple Intelligence, notes can be written on the device. You can also write your own notes, or simply read the transcript.'],
  ['Can other people see the subtitles?',
    'They can if the subtitles are on the screen you share. Captions can appear in screen recordings and screen shares, so check your meeting app’s preview, or turn them off with ⌘⇧C.'],
  ['Why does macOS warn me the first time?',
    'Excerpt is not notarized by Apple, which needs a paid developer account. Install with the Terminal line to skip the warning, or choose Open Anyway once in System Settings.'],
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
        <a className="lp-pill lp-rise" style={beat(0)} href={DOWNLOAD}>
          <span className="lp-pill-new">NEW</span>
          Excerpt for Mac is out, and it’s free
          <span aria-hidden>↓</span>
        </a>

        <p className="lp-eyebrow lp-rise" style={beat(1)}><Icon name="clapper" /> Meeting memory for creative and media agencies</p>
        <h1 className="lp-rise" style={beat(2)}><span>The screen.</span> <span>The speech.</span><br /><em>The meeting, kept together.</em></h1>
        <p className="lp-lead lp-rise" style={beat(3)}>
          Excerpt puts live subtitles on your calls, saves the screens you capture, and hands you a full
          transcript with those screenshots in place when the meeting ends. Notes are there when you want
          them. Free, open source, and it runs on your Mac.
        </p>

        <div className="lp-cta lp-rise" style={beat(4)}>
          <a className="lp-solid lp-lg" href={DOWNLOAD}>Download for Mac <span aria-hidden>↓</span></a>
          <button className="lp-outline lp-lg" onClick={onStart}><span aria-hidden>▷</span> Watch the demo</button>
        </div>
        <div className="lp-hero-cmd lp-rise" style={beat(5)}>
          <span className="lp-label">Or install with one line in Terminal. No security prompt.</span>
          <CommandLine command={INSTALL_COMMAND} label="Terminal install command" />
        </div>

        <ul className="lp-trustrow lp-rise" style={beat(6)} aria-label="At a glance">
          <li><Icon name="ticket" /> Free, no account</li>
          <li><Icon name="seat" /> Stays on your Mac</li>
          <li><Icon name="laptop" /> macOS 26 or later, Apple silicon</li>
        </ul>
        <p className="lp-fineprint lp-rise" style={beat(7)}>
          The download asks you to allow Excerpt once in System Settings. The Terminal line does not. <a className="lp-inline" href="#/install">Install guide</a>
        </p>
      </header>

      <FeatureReel />

      {/* One frame, three scenes, played in the order a meeting has them. */}
      <Showcase />

      <section className="lp-section cs-reveal" id="how-it-works">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ How it works ]</span>
          <h2>Three scenes. <em>One record.</em></h2>
          <p>What a campaign review looks like with Excerpt running. The last scene is the point: a week later, the decision still has the report it was made about sitting next to it.</p>
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
          Excerpt keeps a report as a picture and the conversation as text. It does not read numbers off a screen,
          check a metric, import spreadsheets or PDFs, or connect to an ad platform.
        </p>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="features">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Features ]</span>
          <h2>Made for the review. <em>Kept for later.</em></h2>
          <p>The shortcuts and tools you will actually reach for while work is on screen, and the ones you need when the call is over.</p>
        </div>
        <Bento />
      </section>

      <section className="lp-section lp-split cs-reveal" id="what-it-keeps">
        <div className="lp-split-copy">
          <span className="lp-label lp-label-ember">[ After the review ]</span>
          <h2>The transcript first.<br /><em>Notes when you want them.</em></h2>
          <p>
            Your meeting opens as a transcript, with each screenshot where it was taken. Read it, fix a
            misheard line, or add an image. Nothing is generated until you ask.
          </p>
          <p>
            The Notes tab gives you a blank page, or a Write notes button for a shorter version. Every
            generated note links back to the passage it came from, and stays editable. Your own writing is
            kept if you write notes again.
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
          <h2>For everyone <em>in the review.</em></h2>
          <p>Anyone who shows work on a shared screen, and has to act on the feedback afterwards.</p>
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
          <h2 id="subs-title">While it happens, <em>subtitles.</em></h2>
          <p>Two lines of captions follow the conversation over your meeting window. Pick their look and position, or hide them. The transcript keeps going either way.</p>
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
          <p>Better to know now than to find out later. A tool that asks you to check the source should be clear about what cannot be checked.</p>
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
          <h2>One price.<br /><em>Nothing to pay.</em></h2>
          <p>No trial, no tiers, no subscription. Download it and it is yours.</p>
        </div>
        <div className="lp-price">
          <article className="lp-ticket">
            <div className="lp-ticket-main">
              <span className="lp-ticket-kicker"><Icon name="ticket" /> Admit one</span>
              <h3>Excerpt for Mac</h3>
              <div className="lp-ticket-price"><span>$</span>0</div>
              <p className="lp-ticket-sub">Free. MIT licensed. Every feature included.</p>
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
                <h3>Transcription stays local.</h3>
                <p>Apple’s speech tools turn speech into text on your Mac. Finish setup and install the speech model before your first meeting.</p>
              </div>
            </article>
            <article className="lp-card lp-card-paper">
              <IconTile name="spark" className="ci-tile-ink" />
              <div>
                <h3>Notes are optional.</h3>
                <p>Choose Write notes to use Apple Intelligence on your Mac, or OpenAI with your own key. OpenAI gets the transcript text and screenshot captions, and bills you directly. Screenshot images stay on your Mac.</p>
              </div>
            </article>
            <article className="lp-card lp-card-paper">
              <IconTile name="reel" className="ci-tile-ink" />
              <div>
                <h3>Open to inspect.</h3>
                <p>The capture, transcription, notes and editor code are all on GitHub. Fork it, audit it, or build the app yourself.</p>
                <a className="lp-paper-link" href={SOURCE} target="_blank" rel="noreferrer">Explore the source ↗</a>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="install">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Install ]</span>
          <h2>Two ways <em>in.</em></h2>
          <p>Excerpt is signed, but it is not notarized by Apple, since that needs a paid developer account. So macOS warns you the first time you open a browser download. Install from Terminal and you will not see the warning, or download it and allow it once.</p>
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
            <h2>Questions, <em>answered.</em></h2>
            <p>The things people usually ask before they install. Something missing? <a className="lp-link" href={`${SOURCE}/issues`} target="_blank" rel="noreferrer">Ask on GitHub ↗</a></p>
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
            <p>Meeting memory for creative and media agencies. Free, open source, and stored on your own Mac.</p>
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
          <span>Built for The Build Games.</span>
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
          <p>Two-line, film-style captions over your meeting window. Choose the look and the position, or hide them. The transcript keeps recording either way.</p>
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
          <p>Grab any part of the screen. You can also paste or drop an image in.</p>
        </div>
      </article>

      <article className="bt bt-catchup" style={beat(2)}>
        <div className="bt-scene" aria-hidden>
          <div className="bt-seg"><span>30s</span><span className="is-on">60s</span><span>90s</span></div>
          <div className="bt-lines"><i /><i /><i /><i className="bt-live" /></div>
        </div>
        <div className="bt-copy">
          <h3><Icon name="rewind" /> Catch up <kbd>⌘⇧J</kbd></h3>
          <p>Missed something? Read the last 30, 60 or 90 seconds, then jump back to live.</p>
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
          <p>Choose Write notes for a shorter version. Every note links to the passage it came from. Write them with Apple Intelligence on your Mac, or with your own OpenAI key.</p>
        </div>
      </article>

      <article className="bt bt-retake" style={beat(4)}>
        <div className="bt-scene" aria-hidden>
          <p className="bt-line">Keep the <s>worm</s> <ins>warm</ins> color treatment.</p>
          <span className="bt-tag"><Icon name="retake" /> Original kept</span>
        </div>
        <div className="bt-copy">
          <h3><Icon name="retake" /> Fix a misheard line</h3>
          <p>Correct a word in the transcript. The original wording stays in its history.</p>
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
          <p>Start from the menu bar, the library or the shortcut. Excerpt stays out of your way.</p>
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
