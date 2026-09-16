import { useEffect, useRef, useState } from 'react';
import { Wordmark } from './Wordmark';
import './landing.css';

const SOURCE = 'https://github.com/treycodex/excerpt';

/* ── The page ──────────────────────────────────────────────────────────────────
   Structured the way a modern product page is structured — a centred hero, one
   large product frame you can switch, then eyebrow → heading → cards, repeated —
   because that shape is what a reader arriving from a link already knows how to
   read. What fills it is ours: the near-black ground, the paper cream, the mono
   chrome, the serif turn at the end of a sentence, and the four corner brackets
   that mark the active frame everywhere else in the product.

   Every claim on this page is one the product can keep. The sections that say
   what Excerpt does *not* do are not hedging; they are the argument. */

const HERO_ALT = 'Excerpt’s notes for a campaign review: a sample paid-social performance report '
  + 'captured at 0:22 with its client, channel and 1–30 Sep 2026 period visible, the spoken '
  + 'comparison of Variant B’s click-through rate beneath it, the Variant B creative captured at '
  + '0:41, and a typed note reading “Agreed: test a clearer opening line on Variant B. Brief before Thursday.”';

const NOTES_ALT = 'Excerpt’s review tab for the same campaign: a decision marked DECIDED with the '
  + 'verbatim sentence it came from, an action assigned to you with a due date, and a request from '
  + 'the other side left unassigned under “Who’s doing this?”';

/** The three things the hero can show. Tabs switch the frame, nothing else. */
type Shot = {
  id: string; tab: string; chrome: string; caption: string;
  src?: string; alt?: string; height?: number; video?: boolean;
};

const SHOTS: readonly [Shot, Shot, Shot] = [
  {
    id: 'review',
    tab: 'The review',
    chrome: 'CAMPAIGN REVIEW · PAID SOCIAL · 1–30 SEP',
    caption: 'Captured screens sit on the meeting clock, with the speech from either side of them.',
    src: '/media/campaign-review.png',
    alt: HERO_ALT,
    height: 2128,
  },
  {
    id: 'notes',
    tab: 'The notes',
    chrome: 'REVIEW — DECISIONS · ACTIONS · DEADLINES',
    caption: 'Every item carries the sentence it came from, so you can read it rather than trust it.',
    src: '/media/notes.png',
    alt: NOTES_ALT,
    height: 2682,
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
    'On the Mac, a keyboard shortcut grabs the region on screen — a report, a creative, a deck. In the browser, paste or drop the image into your notes yourself.',
    'Mac shortcut · browser paste'],
  ['02', 'Keep the discussion beside it.',
    'Each screen is placed on the meeting clock, so the speech from either side of it sits with the picture. Nearby speech is context, not a claim that those words describe what is on screen.',
    'Placed on the meeting clock'],
  ['03', 'Write the next step, and come back to it.',
    'Add your own note about what was agreed, correct a misheard line, and every extracted item still links to the passage it came from. Export to Markdown, or to a page with the screens in it.',
    'Yours to keep'],
] as const;

/** cap-style chip grid: a short label and the one line that earns it. */
const KEPT = [
  ['Transcript-linked', 'Every item cites its sentence'],
  ['Four categories', 'Decisions, actions, deadlines, questions'],
  ['An editable document', 'Write, reorder, correct, export'],
  ['Screens on the clock', 'Placed where they happened'],
  ['Transcript corrections', 'Fix a misheard line, review what moved'],
  ['Markdown and HTML', 'One self-contained file, offline'],
] as const;

const WHY = [
  ['Grammar, not a model.',
    'Items come from cue patterns and guards. Titles are verbatim spans of what someone said — never generated, never rewritten. That is the whole claim, and it is checkable.'],
  ['A miss beats a false positive.',
    '“We’ll discuss October next week” is a decision to talk, not a decision. Negation, conditionals, reported speech and questions are all rejected. Ambiguity resolves toward silence.'],
  ['It knows you from not-you.',
    'Two audio streams is the whole of what Excerpt knows about who spoke. A task you took on is yours; “can you send that?” from the far side is left for you to assign.'],
  ['Everything is correctable.',
    'Re-categorise, reassign, set a due date, fix the state, or dismiss it. Excerpt is wrong sometimes, so being wrong has to be cheap.'],
  ['Zero operating cost.',
    'No account, no backend, no database, no API key required. Nothing about this is free-for-now.'],
  ['Truly open source.',
    'MIT. Read how extraction decides what counts as a decision, or build the Mac app yourself from the same source.'],
] as const;

const NOT_CLAIMED = [
  ['Not an audio record', 'A transcript is stored, not a recording. You cannot check a note against the original sound.'],
  ['Timing is approximate', 'The Web Speech API exposes no timestamps, so positions are measured on arrival and lag real speech.'],
  ['It does not read your report', 'A captured screen is kept as a picture. No numbers are read off it, no metric is verified, no ad platform is connected.'],
  ['It cannot tell who people are', 'Only whether a voice was yours. There is no speaker identification.'],
] as const;

const SURFACES = [
  ['The Mac app', 'Subtitles drawn over the meeting itself — no window, no panel. Lives in the menu bar.',
    'macOS 26 or later, Apple silicon. Unsigned: right-click → Open on first launch.', 'Build it from source ↗', SOURCE],
  ['Chrome on macOS', 'Listens to a tab or to everything the Mac is playing, and transcribes on your machine.',
    'Chrome 139+. Needs the SODA language pack that arrives with Live Caption.', 'Open Excerpt ↗', '#/get-started'],
  ['Any modern browser', 'A scripted 102-second demo of a review, with nothing to install and no permissions asked for.',
    'No microphone, no screen sharing, no account.', null, null],
] as const;

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
          <button onClick={() => jump('surfaces')}>Where it runs</button>
          <a href={SOURCE} target="_blank" rel="noreferrer">Open source ↗</a>
        </div>
        <div className="lp-nav-actions">
          <button className="lp-ghost" onClick={onStart}>Watch the demo</button>
          <a className="lp-solid" href="#/get-started">Use Excerpt</a>
        </div>
      </nav>

      <header className="lp-hero">
        <a className="lp-pill" href="#/get-started">
          <span className="lp-pill-new">NEW</span>
          The Mac app draws subtitles over the meeting itself
          <span aria-hidden>→</span>
        </a>

        <p className="lp-eyebrow">Meeting memory for creative and media agencies</p>
        <h1><span>The screen.</span> <span>The speech.</span><br /><em>The note that links them.</em></h1>
        <p className="lp-lead">
          One free, open-source app for campaign reviews, creative feedback and client readouts.
          Excerpt keeps the screen you were looking at, the speech from either side of it, and notes
          where every item points back at the sentence it came from — on your own device.
        </p>

        <div className="lp-cta">
          <a className="lp-solid lp-lg" href="#/get-started">Use Excerpt free <span aria-hidden>↗</span></a>
          <button className="lp-outline lp-lg" onClick={onStart}><span aria-hidden>▷</span> Watch the 102-second demo</button>
        </div>
        <p className="lp-fineprint">No account, no API key, no subscription. Live capture needs Chrome on macOS, or the Mac app.</p>

        <div className="lp-also">
          <span className="lp-label">Also runs as</span>
          <span>Mac app</span><i aria-hidden>·</i>
          <span>Chrome on macOS</span><i aria-hidden>·</i>
          <span>Demo in any browser</span>
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
              : <img key={active.src} src={active.src} alt={active.alt}
                  width={1648} height={active.height} decoding="async" />}
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
          <h2>Notes you can <em>check.</em></h2>
          <p>
            Decisions, action items and deadlines come out of what was actually said. Each one links to
            the passage in your transcript it came from, so you can read the sentence rather than trust
            a summary.
          </p>
          <p>
            A suggestion is not an approval, and a request from the other side of the call is not your
            task: anything Excerpt cannot attribute is left for you to assign.
          </p>
          <div className="lp-split-actions">
            <button className="lp-outline" onClick={onStart}>See it in the demo <span aria-hidden>↗</span></button>
            <a className="lp-text" href="#/get-started">Use Excerpt <span aria-hidden>↗</span></a>
          </div>
        </div>
        <figure className="lp-split-shot">
          <img src="/media/notes.png" alt={NOTES_ALT} loading="lazy" width={1648} height={2682} />
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
          <h2>Built to be <em>wrong cheaply.</em></h2>
          <p>Confident output you cannot verify is the thing this replaces. Every rule below exists so a note you did not write is worth less trust than one you did, and is easy to fix.</p>
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
          <p>Two lines maximum, broken on phrase boundaries rather than width, fading rather than sliding, with the film dash convention when two people overlap. The Mac app draws them over the meeting; the website draws them in the page.</p>
        </div>
        <div className="lp-film-wrap">
          <div className="lp-glow" aria-hidden />
          <div className="lp-film">
            <ProductFilm />
            <span className="lp-brackets" aria-hidden><i /><i /><i /><i /></span>
          </div>
          <div className="lp-film-credit">
            <span className="lp-label">Real product footage · Excerpt in session</span>
            <button className="lp-text" onClick={onStart}>Try the demo <span aria-hidden>↗</span></button>
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
            <p>No account and no subscription. Notes and captured screens stay in your browser, or in the Mac app’s own folder, ready to export.</p>
          </article>
          <article className="lp-card lp-card-paper">
            <h3>Transcription stays local.</h3>
            <p>Speech is transcribed on your machine. If an on-device model is unavailable, cloud transcription is offered only after you agree to it — never silently.</p>
          </article>
          <article className="lp-card lp-card-paper">
            <h3>Rewriting is optional.</h3>
            <p>The Mac app can tidy the wording with Apple Intelligence on your Mac, or with your own OpenAI key — which sends transcript text to OpenAI and is billed to you. It never produces items.</p>
          </article>
        </div>
        <div className="lp-trust">
          <div><span className="lp-label lp-label-ink">MIT licensed</span><p>Every line on GitHub. Fork it, audit it, or build the Mac app yourself.</p></div>
          <div><span className="lp-label lp-label-ink">On-device speech</span><p>Chrome’s built-in engine, or Apple’s SpeechAnalyzer in the Mac app.</p></div>
          <div><span className="lp-label lp-label-ink">No lock-in</span><p>Notes export as Markdown, or as one self-contained HTML page with the screens in it.</p></div>
          <div><span className="lp-label lp-label-ink">No account</span><p>There is nothing to sign up for, and nothing to cancel.</p></div>
        </div>
        <p className="lp-paper-note">Read the code or build Excerpt yourself. <a href={SOURCE} target="_blank" rel="noreferrer">Explore the source ↗</a></p>
      </section>

      <section className="lp-section lp-centred cs-reveal" id="surfaces">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Where it runs ]</span>
          <h2>A Mac app, a browser tab, <em>and a demo.</em></h2>
          <p>The website can only hear what a tab hands it, and can only draw captions inside a page. The Mac app hears the meeting through ScreenCaptureKit and draws subtitles over it. Both run the same extraction engine.</p>
        </div>
        <div className="lp-cards lp-cards-3">
          {SURFACES.map(([title, body, req, cta, href]) => (
            <article className="lp-card lp-surface" key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className="lp-label lp-card-meta">{req}</span>
              {cta && href
                ? <a className="lp-outline lp-full" href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{cta}</a>
                : <button className="lp-outline lp-full" onClick={onStart}>Watch the demo ↗</button>}
            </article>
          ))}
        </div>
      </section>

      <section className="lp-final cs-reveal">
        <span className="lp-label lp-label-ember">For your next campaign review</span>
        <h2>Keep the work, the numbers,<br /><em>and the conversation.</em></h2>
        <div className="lp-cta lp-cta-centred">
          <a className="lp-solid lp-lg" href="#/get-started">Use Excerpt free <span aria-hidden>↗</span></a>
          <button className="lp-outline lp-lg" onClick={onStart}><span aria-hidden>▷</span> Watch the demo</button>
        </div>
        <p className="lp-fineprint">No account. No credit card. No subscription.</p>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-cols">
          <div className="lp-footer-brand">
            <a href="#/" aria-label="Excerpt home"><Wordmark /></a>
            <p>Meeting memory for creative and media agencies. Free, open source, and stored on your own device.</p>
          </div>
          <div>
            <span className="lp-label">Product</span>
            <a href="#/get-started">Get started</a>
            <a href="#/meetings">Your meetings</a>
            <button className="lp-text" onClick={onStart}>The demo</button>
          </div>
          <div>
            <span className="lp-label">The page</span>
            <button className="lp-text" onClick={() => jump('how-it-works')}>How it works</button>
            <button className="lp-text" onClick={() => jump('what-it-keeps')}>What it keeps</button>
            <button className="lp-text" onClick={() => jump('surfaces')}>Where it runs</button>
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
