import { useEffect, useRef, useState } from 'react';
import { Wordmark } from './Wordmark';
import './landing.css';

const SOURCE = 'https://github.com/treycodex/excerpt';
const STEPS = [
  ['01', 'Start your meeting.', 'Choose your microphone, then start from Excerpt’s menu or library.', 'A minute to set up'],
  ['02', 'Get live subtitles.', 'Excerpt transcribes as people speak and displays the words as cinematic subtitles.', 'Live, as you speak'],
  ['03', 'Review your notes.', 'End the meeting to review decisions, action items, and deadlines. Check the transcript, edit your notes, and export them.', 'Yours to keep'],
];

export function Landing() {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  return (
    <div className="editorial">
      <nav className="ed-nav" aria-label="Main">
        <a className="ed-logo" href="#/" aria-label="Excerpt home"><Wordmark markOnly /></a>
        <span className="ed-nav-note">Meeting notes.<br />Free and open source.</span>
        <div className="ed-nav-links"><button onClick={() => jump('the-experience')}>Features</button><a href={SOURCE} target="_blank" rel="noreferrer">Open source ↗</a></div>
        <a className="ed-nav-start" href={SOURCE} target="_blank" rel="noreferrer">View on GitHub <span>↗</span></a>
      </nav>

      <header className="ed-masthead">
        <div className="ed-masthead-meta"><span>FREE, OPEN-SOURCE MEETING NOTES</span><span>CINEMATIC SUBTITLES. CLEAR NOTES.</span></div>
        <div className="ed-wordmark" aria-label="Excerpt">excerpt<span>✳</span></div>
      </header>

      <section className="ed-hero" aria-labelledby="ed-title">
        <img className="ed-hero-image" src="/media/editorial-hero.jpg" alt="A quiet coastline in the last light of the day" fetchPriority="high" />
        <div className="ed-hero-shade" />
        <div className="ed-hero-top"><span>MADE FOR YOUR MEETINGS</span><span>FREE TO USE. OPEN SOURCE.</span></div>
        <div className="ed-hero-bottom">
          <div><p className="ed-label">MEET EXCERPT</p><h1 id="ed-title">Meeting notes.<br />Cinematic feel.<br /><em>Free. Open source.</em></h1></div>
          <div className="ed-hero-aside"><p>Live subtitles while you meet.<br />Decisions and action items when you’re done.</p><a className="ed-button" href={SOURCE} target="_blank" rel="noreferrer">View Excerpt on GitHub <span>↗</span></a><button className="ed-text-button" onClick={() => jump('the-experience')}>↓ &nbsp; Explore the experience</button><small>No account. No subscription.</small></div>
        </div>
      </section>
      <div className="ed-film-caption"><span>LIVE SUBTITLES · TRANSCRIPTS · MEETING NOTES</span><span>01 / EXCERPT</span></div>

      <section className="ed-intro" id="the-experience">
        <span className="ed-label">[ MEETING NOTES, SIMPLIFIED ]</span>
        <div><h2>Your meeting.<br /><em>Already in notes.</em></h2><div className="ed-intro-bottom"><p>Excerpt is a free, open-source alternative to Granola and Tactiq. It transcribes your meetings and extracts decisions, action items, deadlines, and open questions.</p><button className="ed-link" onClick={() => jump('how-it-works')}>How it works <span>↓</span></button></div></div>
      </section>

      <section className="ed-product" aria-labelledby="product-title">
        <div className="ed-section-line"><span className="ed-label">[ DURING YOUR MEETING ]</span><span className="ed-label">01 — LIVE SUBTITLES</span></div>
        <div className="ed-section-heading"><h2 id="product-title">Live subtitles.<br /><em>A cinematic touch.</em></h2><p>Follow your meeting with film-style subtitles.<br />Two lines at a time, updated as people speak.</p></div>
        <ProductFilm />
        <div className="ed-film-caption"><span>REAL PRODUCT FOOTAGE · EXCERPT IN SESSION</span><a href={SOURCE} target="_blank" rel="noreferrer">Explore the source ↗</a></div>
      </section>

      <section className="ed-notes">
        <div className="ed-notes-copy"><span className="ed-label">[ AFTER YOUR MEETING ]</span><h2>Meeting notes<br /><em>you can check.</em></h2><p>Review decisions, action items, and deadlines. Each note links to the passage in your transcript it came from.</p><p>Check what was said, edit any note, and export to Markdown.</p><a className="ed-link" href={SOURCE} target="_blank" rel="noreferrer">See how the notes work <span>↗</span></a></div>
        <figure><img src="/media/notes.png" alt="Excerpt's notes workspace: a meeting's decisions, each with the passage it came from" loading="lazy" /><figcaption>02 — NOTES LINKED TO YOUR TRANSCRIPT</figcaption></figure>
      </section>

      <section className="ed-how" id="how-it-works"><div className="ed-section-line"><span className="ed-label">[ HOW IT WORKS ]</span><span className="ed-label">THREE SIMPLE STEPS</span></div><h2>Meeting notes in <em>three steps.</em></h2><div className="ed-steps">{STEPS.map(([n, title, body, meta]) => <article key={n}><span className="ed-step-number">{n}</span><h3>{title}</h3><p>{body}</p><span className="ed-label">{meta}</span></article>)}</div><div className="ed-how-footer"><span>Excerpt is a native Mac app built for local capture, captions, and meeting storage.</span><a className="ed-button" href={SOURCE} target="_blank" rel="noreferrer">View the Mac app <span>↗</span></a></div></section>

      <section className="ed-manifesto"><span className="ed-label">[ FREE AND OPEN SOURCE ]</span><h2>Beautiful meeting notes.<br /><em>No subscription.</em></h2><div className="ed-principles"><article><h3>Free to use.</h3><p>No account or subscription. Your meetings stay on your Mac, ready to export.</p></article><article><h3>Private by default.</h3><p>Speech and meeting files stay local. Optional AI enhancement is your choice.</p></article><article><h3>Open source.</h3><p>Read the code, build Excerpt yourself, or contribute on GitHub.</p><a href={SOURCE} target="_blank" rel="noreferrer">Explore the source ↗</a></article></div></section>

      <footer className="ed-footer"><div className="ed-footer-top"><span className="ed-label">TRY EXCERPT FOR YOUR NEXT MEETING.</span><a href={SOURCE} target="_blank" rel="noreferrer">Meeting notes.<br /><em>Start for free.</em> <span>↗</span></a><div><a className="ed-button" href={SOURCE} target="_blank" rel="noreferrer">View Excerpt on GitHub <span>↗</span></a><p>No account. No credit card. No subscription.</p></div></div><div className="ed-footer-bottom"><span>© {new Date().getFullYear()} Excerpt</span><a href={SOURCE} target="_blank" rel="noreferrer">GitHub ↗</a><span>Native Mac app.</span><span>Free and open source.</span></div></footer>
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
