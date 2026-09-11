import { Wordmark } from './Wordmark';
import './setup.css';

export function GetStarted() {
  const download = import.meta.env.VITE_MAC_DOWNLOAD_URL as string | undefined;
  const comparison = [
    ['Where captions appear', 'Over Zoom, Meet, Teams, or any Mac app', 'Inside the Excerpt browser tab'],
    ['Meeting audio', 'Listens to audio from Mac apps', 'Requires sharing a tab or screen with audio'],
    ['Meeting notes', 'Saved as local meetings on your Mac', 'Saved in this browser only'],
    ['Note quality', 'On-device AI organizes key points and topics when available', 'Transcript-based key points and action items'],
    ['Timestamps', 'Audio-aligned when speech provides timing', 'Approximate, based on when text arrives'],
    ['How it runs', 'One click from the menu bar', 'Keep the Excerpt tab open'],
    ['Cost and account', 'Free · No account', 'Free · No account'],
  ] as const;
  return <div className="setup-page">
    <nav className="setup-nav"><a href="#/" aria-label="Excerpt home"><Wordmark /></a><span>FREE. OPEN SOURCE. YOURS.</span></nav>
    <div className="get-started">
      <span className="setup-eyebrow">WELCOME TO EXCERPT</span>
      <h1>Your next meeting.<br /><em>Already in notes.</em></h1>
      <p className="setup-description">Download the Mac app for captions that follow you across meeting apps and richer notes made on your device. Use the browser when you want to try Excerpt without installing anything. Both are free and need no account.</p>
      <section className="setup-comparison" aria-labelledby="comparison-title">
        <div className="setup-comparison-heading"><span className="setup-eyebrow">MAC APP VS. BROWSER</span><h2 id="comparison-title">One Excerpt.<br /><em>Two ways in.</em></h2></div>
        <div className="comparison-table" role="table" aria-label="Compare Excerpt for Mac and browser">
          <div className="comparison-row comparison-head" role="row">
            <span className="comparison-corner" role="columnheader">Compare</span>
            <article className="comparison-product mac" role="columnheader">
              <div className="comparison-product-top"><span className="setup-platform-icon">⌘</span><span className="setup-badge">Recommended</span></div>
              <span className="setup-eyebrow">THE FULL EXPERIENCE</span>
              <h3>Excerpt for Mac</h3>
              <p>Captions that follow the meeting, with richer notes made privately on your Mac.</p>
            </article>
            <article className="comparison-product browser" role="columnheader">
              <div className="comparison-product-top"><span className="setup-platform-icon">▤</span><span className="comparison-install">No install</span></div>
              <span className="setup-eyebrow">TRY IT NOW</span>
              <h3>Use your browser</h3>
              <p>Capture one meeting from Chrome and keep the experience inside a tab.</p>
            </article>
          </div>
          {comparison.map(([feature, mac, web]) => <div className="comparison-row comparison-feature" role="row" key={feature}><span role="rowheader">{feature}</span><p role="cell"><i aria-hidden="true">●</i>{mac}</p><p role="cell">{web}</p></div>)}
          <div className="comparison-row comparison-actions" role="row">
            <span role="rowheader">Start here</span>
            <div role="cell">{download ? <a className="setup-primary" href={download}>Download for Mac <span>↓</span></a> : <a className="setup-primary" href="https://github.com/treycodex/excerpt#the-mac-app" target="_blank" rel="noreferrer">Build from source <span>↗</span></a>}<small>macOS 26 or later · Apple silicon</small>{!download && <p className="setup-release-note">No public download yet. Build it once using the README.</p>}</div>
            <div role="cell"><a className="setup-secondary" href="#/setup">Set up in browser <span>↗</span></a><small>Chrome on macOS for live capture</small><a className="setup-demo-link" href="#/session">Just exploring? Try the demo →</a></div>
          </div>
        </div>
      </section>
      <section className="setup-install"><span className="setup-eyebrow">INSTALLING THE MAC APP</span><h2>Download. Open. <em>You’re in.</em></h2><ol><li><b>01</b><div><strong>Open the DMG</strong><p>Drag Excerpt into Applications, then open it from there.</p></div></li><li><b>02</b><div><strong>Make it yours</strong><p>Pick a subtitle style, allow meeting audio access, and prepare on-device transcription.</p></div></li><li><b>03</b><div><strong>Start a meeting</strong><p>Click Excerpt in the menu bar and choose Start listening.</p></div></li></ol><p className="setup-release-note">The current Mac build isn’t Apple-notarized. macOS may block it on first open; installation details are in the <a href="https://github.com/treycodex/excerpt#the-app-is-unsigned" target="_blank" rel="noreferrer">Mac setup guide</a>.</p></section>
    </div>
  </div>;
}
