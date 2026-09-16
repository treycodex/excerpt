/* ── The previous landing page, kept for comparison ────────────────────────────
   The editorial layout this page ran until the redesign, reachable only at
   `#/oldlandingpage` and linked from nowhere. It is a copy, not the live page: it
   has its own stylesheet (`landing-legacy.css`) so editing the current landing
   cannot silently change what this shows, and nothing else imports it.

   It is here to be looked at, not maintained. If it is still unopened when the
   redesign has settled, delete both files and the `landing-legacy` route with them.

   One caveat on faithfulness: a single uncommitted line that was in the working
   tree at the time of the redesign is not in this copy, which is taken from the
   last commit before it (d533191). */

import { useEffect, useRef, useState } from 'react';
import { Wordmark } from './Wordmark';
import './landing-legacy.css';

const SOURCE = 'https://github.com/treycodex/excerpt';

/**
 * The job, in the order it happens.
 *
 * Deliberately specific about which half of the product each step belongs to: the
 * Mac captures a region behind a shortcut, and a browser takes an image the reader
 * pastes or drops. Describing them as one feature would promise screen capture the
 * website cannot do — and step one has to say, in the copy, that what is kept is a
 * picture of the report rather than its numbers.
 */
const STEPS = [
  ['01', 'Capture the screen you are reviewing.',
    'On the Mac, a keyboard shortcut captures the region on screen — a report, a creative, a deck. In the browser, paste or drop the image into your notes yourself.',
    'Mac shortcut · browser paste'],
  ['02', 'Keep the discussion beside it.',
    'Each screen is placed on the meeting clock, so the speech from either side of it sits with the picture. Nearby speech is context, not a claim that those words describe what is on screen.',
    'Placed on the meeting clock'],
  ['03', 'Write the next step, and come back to it.',
    'Add your own note about what was agreed, correct a misheard line, and every extracted item still links to the passage it came from. Export to Markdown, or to a page with the screens in it.',
    'Yours to keep'],
];

const HERO_ALT = 'Excerpt’s notes for a campaign review: a sample paid-social performance report '
  + 'captured at 0:22 with its client, channel and 1–30 Sep 2026 period visible, the spoken '
  + 'comparison of Variant B’s click-through rate beneath it, the Variant B creative captured at '
  + '0:41, and a typed note reading “Agreed: test a clearer opening line on Variant B. Brief before Thursday.”';

export function LandingLegacy({ onStart }: { onStart: () => void }) {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  return (
    <div className="editorial">
      <nav className="ed-nav" aria-label="Main">
        <a className="ed-logo" href="#/" aria-label="Excerpt home"><Wordmark markOnly /></a>
        <span className="ed-nav-note">The work, the numbers,<br />and the conversation.</span>
        <div className="ed-nav-links"><button onClick={() => jump('how-it-works')}>How it works</button><a href={SOURCE} target="_blank" rel="noreferrer">Open source ↗</a></div>
        <a className="ed-nav-start" href="#/get-started">Use Excerpt <span>↗</span></a>
      </nav>

      <header className="ed-masthead">
        <div className="ed-masthead-meta"><span>MEETING MEMORY FOR CREATIVE AND MEDIA AGENCIES</span><span>FREE. OPEN SOURCE. ON YOUR DEVICE.</span></div>
        <div className="ed-wordmark" aria-label="Excerpt">excerpt<span>✳</span></div>
      </header>

      {/* The hero is the product, not a photograph. A review is a thing people look
          at together, so the first screen has to show one being remembered — and it
          has to still say all of that with motion and video disabled. */}
      <section className="ed-hero" aria-labelledby="ed-title">
        <div className="ed-hero-copy">
          <p className="ed-label">FOR CREATIVE AND MEDIA AGENCIES</p>
          <h1 id="ed-title">Keep the creative,<br />the numbers, and the<br /><em>conversation together.</em></h1>
          <p className="ed-hero-lead">Turn creative reviews, performance reports, and client feedback into editable meeting notes—with the screens and discussion behind each next step.</p>
          <div className="ed-hero-actions">
            <a className="ed-button" href="#/get-started">Use Excerpt <span>↗</span></a>
            <button className="ed-text-button" onClick={onStart}>▷ &nbsp; Try the meeting-notes demo</button>
            <small>Scripted browser demo · no account or permissions needed.</small>
          </div>
        </div>
        <figure className="ed-hero-figure">
          {/* React 18 does not pass `fetchPriority` through and warns on every render;
              the hero still is the first image in the document, which is the hint
              browsers act on anyway. */}
          <img src="/media/campaign-review.png" alt={HERO_ALT} width={824} height={1064} decoding="async" />
          <figcaption>SAMPLE AGENCY CAMPAIGN REVIEW IN EXCERPT</figcaption>
        </figure>
      </section>
      <div className="ed-film-caption"><span>REPORTS · CREATIVE · DISCUSSION · TRANSCRIPT-LINKED NOTES</span><span>01 / EXCERPT</span></div>

      <section className="ed-intro">
        <span className="ed-label">[ THE PROBLEM WITH REVIEWS ]</span>
        <div><h2>The decision survives.<br /><em>The screen does not.</em></h2><div className="ed-intro-bottom"><p>Creative reviews, performance calls and client readouts all happen on a shared screen. A week later you remember that something was agreed about Variant B, and nothing about the report you were looking at when you agreed it. Excerpt keeps the screen, the speech either side of it, and notes you can correct — on your own device.</p><button className="ed-link" onClick={() => jump('how-it-works')}>How it works <span>↓</span></button></div></div>
      </section>

      <section className="ed-how" id="how-it-works"><div className="ed-section-line"><span className="ed-label">[ HOW IT WORKS ]</span><span className="ed-label">THREE STEPS</span></div><h2>A review you can <em>open again.</em></h2><div className="ed-steps">{STEPS.map(([n, title, body, meta]) => <article key={n}><span className="ed-step-number">{n}</span><h3>{title}</h3><p>{body}</p><span className="ed-label">{meta}</span></article>)}</div><div className="ed-how-footer"><span>A captured report is kept as a picture and the conversation as a transcript. Excerpt does not read the numbers off a report, verify a metric, import spreadsheets or PDFs, or connect to an ad platform. Live capture works in Chrome on macOS, or in the Mac app; the demo works in any modern browser.</span><a className="ed-button" href="#/get-started">Use Excerpt <span>↗</span></a></div></section>

      <section className="ed-notes">
        <div className="ed-notes-copy"><span className="ed-label">[ AFTER THE REVIEW ]</span><h2>Notes you can<br /><em>check.</em></h2><p>Decisions, action items and deadlines come out of what was actually said. Each one links to the passage in your transcript it came from, so you can read the sentence rather than trust a summary.</p><p>A suggestion is not an approval, and a request from the other side of the call is not your task: anything Excerpt cannot attribute is left for you to assign.</p><button className="ed-link" onClick={onStart}>See the notes in the demo <span>↗</span></button></div>
        <figure><img src="/media/notes.png" alt="Excerpt's review tab for the same campaign: a decision marked DECIDED with the verbatim sentence it came from, an action assigned to you with a due date, and a request from the other side left unassigned under “Who's doing this?”" loading="lazy" /><figcaption>02 — EVERY ITEM, AND THE SENTENCE IT CAME FROM</figcaption></figure>
      </section>

      {/* Captions still matter during the meeting; they are no longer the pitch. */}
      <section className="ed-product" aria-labelledby="product-title">
        <div className="ed-section-line"><span className="ed-label">[ DURING THE REVIEW ]</span><span className="ed-label">03 — LIVE SUBTITLES</span></div>
        <div className="ed-section-heading"><h2 id="product-title">And while it happens,<br /><em>subtitles.</em></h2><p>Film-style subtitles follow the conversation while you are looking at the work,<br />so you can watch the screen instead of the transcript.</p></div>
        <ProductFilm />
        <div className="ed-film-caption"><span>REAL PRODUCT FOOTAGE · EXCERPT IN SESSION</span><button onClick={onStart}>Try the demo ↗</button></div>
      </section>

      <section className="ed-manifesto"><span className="ed-label">[ FREE AND OPEN SOURCE ]</span><h2>Your review.<br /><em>Your device.</em></h2><div className="ed-principles"><article><h3>Free to use.</h3><p>No account and no subscription. Notes and captured screens stay in your browser, or in the Mac app’s own folder, ready to export.</p></article><article><h3>Transcription stays local.</h3><p>Speech is transcribed on your machine. If an on-device model is unavailable, cloud transcription is offered only after you agree to it.</p></article><article><h3>Rewriting is optional.</h3><p>The Mac app can tidy the wording with Apple Intelligence on your Mac, or with your own OpenAI key — which sends transcript text to OpenAI and is billed to you. Neither is on unless you choose it.</p></article></div><p className="ed-manifesto-note">Read the code or build Excerpt yourself. <a href={SOURCE} target="_blank" rel="noreferrer">Explore the source ↗</a></p></section>

      <footer className="ed-footer"><div className="ed-footer-top"><span className="ed-label">FOR YOUR NEXT CAMPAIGN REVIEW.</span><a href="#/get-started">The work, the numbers,<br /><em>the conversation.</em> <span>↗</span></a><div><a className="ed-button" href="#/get-started">Use Excerpt <span>↗</span></a><p>No account. No credit card. No subscription.</p></div></div><div className="ed-footer-bottom"><span>© {new Date().getFullYear()} Excerpt</span><a href="#/meetings">Your meetings</a><a href={SOURCE} target="_blank" rel="noreferrer">GitHub ↗</a><span>Free and open source.</span></div></footer>
    </div>
  );
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
  return <div className="ed-product-film"><video ref={video} poster="/media/meeting-poster.jpg" muted loop playsInline preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-label="Excerpt demonstration with live meeting subtitles"><source src="/media/meeting.webm" type="video/webm" /><source src="/media/meeting.mp4" type="video/mp4" /></video><button className="ed-video-toggle" onClick={() => { if (playing) video.current?.pause(); else void video.current?.play().catch(() => {}); }} aria-label={playing ? 'Pause product video' : 'Play product video'}>{playing ? 'Ⅱ Pause' : '▷ Play'}</button></div>;
}
