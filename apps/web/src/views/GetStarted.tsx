import { Wordmark } from './Wordmark';
import './setup.css';

/**
 * The install steps, which have to match the thing the button actually gives you.
 *
 * These read "Open the DMG · Drag Excerpt into Applications" under a heading
 * saying "Download. Open. You're in." — in the state that ships today, where the
 * button is "Build from source" and there is no DMG to open. Gatekeeper was a
 * footnote at the bottom of the page, after the pitch, although it is the step
 * people actually get stuck on: double-clicking an unsigned app gives a dialog
 * with no Open button, which looks exactly like a broken download.
 */
const DOWNLOAD_STEPS = [
  ['Open the DMG', 'Drag Excerpt into Applications, then open it from there.'],
  ['Right-click it, then choose Open',
    'Excerpt has no Apple certificate, so macOS refuses it on a double-click and shows a dialog with no Open button. Right-click → Open → Open again, once. macOS remembers.'],
  ['Allow what it needs',
    'Grant meeting audio access and prepare on-device transcription. Subtitle style and note priorities are optional, and live in Preferences.'],
  ['Start a meeting', 'Click Excerpt in the menu bar and choose Start listening.'],
] as const;

const SOURCE_STEPS = [
  ['Clone and build it', 'The README has the four commands. It takes a few minutes and needs Xcode.'],
  ['Open the app you built',
    'A locally built app is not quarantined, so Gatekeeper does not block it and none of the unsigned-app warnings apply.'],
  ['Allow what it needs',
    'Grant meeting audio access and prepare on-device transcription. Subtitle style and note priorities are optional, and live in Preferences.'],
  ['Start a meeting', 'Click Excerpt in the menu bar and choose Start listening.'],
] as const;

export function GetStarted() {
  const download = import.meta.env.VITE_MAC_DOWNLOAD_URL as string | undefined;
  const steps = download ? DOWNLOAD_STEPS : SOURCE_STEPS;
  const comparison = [
    ['Screens in your notes', 'A keyboard shortcut captures the report or creative on screen', 'Paste or drop an image into your notes yourself'],
    ['Where captions appear', 'Over Zoom, Meet, Teams, or any Mac app', 'Inside the Excerpt browser tab'],
    ['Meeting audio', 'Listens to audio from Mac apps', 'Requires sharing a tab or screen with audio'],
    ['Meeting notes', 'Saved as local meetings on your Mac', 'Saved in this browser only'],
    ['Note wording', 'Optional: Apple Intelligence on your Mac, or your own OpenAI key', 'Transcript-based key points and action items'],
    ['Timestamps', 'Audio-aligned when speech provides timing', 'Approximate, based on when text arrives'],
    ['How it runs', 'One click from the menu bar', 'Keep the Excerpt tab open'],
    ['Cost and account', 'Free · No account', 'Free · No account'],
  ] as const;
  return <div className="setup-page">
    <nav className="setup-nav"><a href="#/" aria-label="Excerpt home"><Wordmark /></a><span>FREE. OPEN SOURCE. YOURS.</span></nav>
    <div className="get-started">
      <span className="setup-eyebrow">WELCOME TO EXCERPT</span>
      <h1>The work, the numbers,<br /><em>the conversation.</em></h1>
      <p className="setup-description">{download
        ? 'Download the Mac app to capture the report or creative on screen with a keyboard shortcut, with captions that follow you across meeting apps. Use the browser to paste those screens into your notes without installing anything. Both are free and need no account.'
        : 'Start in your browser — it works now, in Chrome, with nothing to install. The Mac app captures the screen with a keyboard shortcut and draws captions over any meeting app, and today it has to be built from source. Both are free and need no account.'}</p>
      <section className="setup-comparison" aria-labelledby="comparison-title">
        <div className="setup-comparison-heading"><span className="setup-eyebrow">MAC APP VS. BROWSER</span><h2 id="comparison-title">One Excerpt.<br /><em>Two ways in.</em></h2></div>
        <div className="comparison-table" role="table" aria-label="Compare Excerpt for Mac and browser">
          <div className="comparison-row comparison-head" role="row">
            <span className="comparison-corner" role="columnheader">Compare</span>
            <article className="comparison-product mac" role="columnheader">
              <div className="comparison-product-top"><span className="setup-platform-icon">⌘</span><span className="setup-badge">{download ? 'Recommended' : 'Build it yourself'}</span></div>
              <span className="setup-eyebrow">THE FULL EXPERIENCE</span>
              <h3>Excerpt for Mac</h3>
              <p>Capture the report or creative on screen, with captions that follow the meeting and notes kept on your Mac.</p>
            </article>
            <article className="comparison-product browser" role="columnheader">
              <div className="comparison-product-top"><span className="setup-platform-icon">▤</span><span className={download ? 'comparison-install' : 'setup-badge'}>{download ? 'No install' : 'Start here'}</span></div>
              <span className="setup-eyebrow">TRY IT NOW</span>
              <h3>Use your browser</h3>
              <p>Capture one review from Chrome, and paste the reports and creative you are discussing into the notes.</p>
            </article>
          </div>
          {comparison.map(([feature, mac, web]) => <div className="comparison-row comparison-feature" role="row" key={feature}><span role="rowheader">{feature}</span><p role="cell"><i aria-hidden="true">●</i>{mac}</p><p role="cell">{web}</p></div>)}
          <div className="comparison-row comparison-actions" role="row">
            <span role="rowheader">Start here</span>
            <div role="cell">{download ? <a className="setup-primary" href={download}>Download for Mac <span>↓</span></a> : <a className="setup-secondary" href="https://github.com/treycodex/excerpt#the-mac-app" target="_blank" rel="noreferrer">Build from source <span>↗</span></a>}<small>macOS 26 or later · Apple silicon</small>{!download && <p className="setup-release-note">There is no download yet, so this one needs Xcode and a few minutes. If that is not today, the browser does the same review without installing anything.</p>}</div>
            <div role="cell"><a className={download ? 'setup-secondary' : 'setup-primary'} href="#/record">Set up meeting audio <span>↗</span></a><small>Chrome on macOS for live capture</small><a className="setup-demo-link" href="#/session">Just exploring? Try the demo →</a></div>
          </div>
        </div>
      </section>
      <section className="setup-install">
        <span className="setup-eyebrow">INSTALLING THE MAC APP</span>
        <h2>{download ? <>Download. Open once the long way. <em>You’re in.</em></> : <>Build it. Open it. <em>You’re in.</em></>}</h2>
        <ol>{steps.map(([title, detail], i) => (
          <li key={title}><b>{String(i + 1).padStart(2, '0')}</b><div><strong>{title}</strong><p>{detail}</p></div></li>
        ))}</ol>
        <p className="setup-release-note">Excerpt has no Apple Developer certificate, because a free tool should not have a yearly subscription hiding inside it. The full explanation, and the fix if macOS calls the app damaged, is in the <a href="https://github.com/treycodex/excerpt#the-app-is-unsigned" target="_blank" rel="noreferrer">Mac setup guide</a>.</p>
      </section>
    </div>
  </div>;
}
