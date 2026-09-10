import { Wordmark } from './Wordmark';
import './setup.css';

export function GetStarted() {
  const download = import.meta.env.VITE_MAC_DOWNLOAD_URL as string | undefined;
  return <div className="setup-page">
    <nav className="setup-nav"><a href="#/" aria-label="Excerpt home"><Wordmark /></a><span>FREE. OPEN SOURCE. YOURS.</span></nav>
    <div className="get-started">
      <span className="setup-eyebrow">WELCOME TO EXCERPT</span>
      <h1>Your next meeting.<br /><em>Already in notes.</em></h1>
      <p className="setup-description">The Mac app is the full product — subtitles over any meeting app, and notes kept on your Mac. The browser version does as much as a browser tab can. No account or subscription either way.</p>
      <div className="setup-platforms">
        <article className="setup-platform mac"><span className="setup-badge">Recommended</span><span className="setup-platform-icon">⌘</span><span className="setup-eyebrow">THE FULL EXPERIENCE</span><h2>Excerpt for Mac</h2><p>Subtitles over your meeting apps. Notes on your Mac. Everything in your menu bar.</p><ul><li>Works with audio from your Mac’s apps</li><li>On-device transcription</li><li>Setup opens automatically on first launch</li></ul>
          {download ? <a className="setup-primary" href={download}>Download for Mac <span>↓</span></a> : <a className="setup-primary" href="https://github.com/treycodex/excerpt#the-mac-app" target="_blank" rel="noreferrer">Build from source <span>↗</span></a>}
          <small>macOS 26 or later · Apple silicon</small>
          {!download && <p className="setup-release-note">There’s no public download yet, so you build it once from source — the README walks through it.</p>}
        </article>
        <article className="setup-platform"><span className="setup-platform-icon">▤</span><span className="setup-eyebrow">NOTHING TO INSTALL</span><h2>Use your browser</h2><p>Capture a meeting, follow live subtitles, and export your notes from a browser tab.</p><ul><li>Choose your subtitle style</li><li>Connect your microphone and meeting audio</li><li>Captions stay inside the tab</li><li>Notes live in this browser only</li></ul><a className="setup-secondary" href="#/setup">Set up in browser <span>↗</span></a><small>Chrome on macOS for live capture</small><a className="setup-demo-link" href="#/session">Just exploring? Try the demo →</a></article>
      </div>
      <section className="setup-install"><span className="setup-eyebrow">INSTALLING THE MAC APP</span><h2>Download. Open. <em>You’re in.</em></h2><ol><li><b>01</b><div><strong>Open the DMG</strong><p>Drag Excerpt into Applications, then open it from there.</p></div></li><li><b>02</b><div><strong>Make it yours</strong><p>Pick a subtitle style, allow meeting audio access, and prepare on-device transcription.</p></div></li><li><b>03</b><div><strong>Start a meeting</strong><p>Click Excerpt in the menu bar and choose Start listening.</p></div></li></ol><p className="setup-release-note">The current Mac build isn’t Apple-notarized. macOS may block it on first open; installation details are in the <a href="https://github.com/treycodex/excerpt#the-app-is-unsigned" target="_blank" rel="noreferrer">Mac setup guide</a>.</p></section>
    </div>
  </div>;
}
