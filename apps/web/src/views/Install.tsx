import { useRef, useState } from 'react';
import { Wordmark } from './Wordmark';
import './landing.css';
import { DOWNLOAD, INSTALL_COMMAND, INSTALL_SCRIPT, REQUIRES, SOURCE, UNQUARANTINE_COMMAND } from './site';

/* ── Installing ────────────────────────────────────────────────────────────────
   Excerpt is not notarized, so there are two honest ways in, and the page offers
   both at the same weight: one line in Terminal, which macOS never stops because
   curl does not mark what it downloads, or the disk image, which macOS stops once
   until it is allowed in Privacy & Security. Neither is dressed up as the other. */

/** What the Terminal line does, in the order install.sh does it. */
const SCRIPT_STEPS = [
  ['01', 'Checks this Mac.',
    'Apple silicon and macOS 26 or later. On any other Mac it stops before downloading anything.'],
  ['02', 'Downloads the latest release.',
    'The same Excerpt.dmg the Download button gets, from the project’s GitHub releases.'],
  ['03', 'Checks the signature.',
    'The app has to be signed with the certificate every Excerpt release is signed with. If it is not, nothing is installed.'],
  ['04', 'Installs and opens it.',
    'Copies Excerpt into Applications and opens it. If your account cannot write to that folder, it uses the Applications folder in your home folder instead.'],
] as const;

/** The disk-image path. macOS wording is quoted exactly, because people match on it. */
const DOWNLOAD_STEPS = [
  ['01', 'Drag it into Applications.',
    'Open Excerpt.dmg and drag Excerpt onto the Applications folder beside it.'],
  ['02', 'Open it once, and choose Done.',
    'macOS says Apple could not verify that Excerpt is free of malware, and does not open it. Choose Done, not Move to Trash.'],
  ['03', 'Choose Open Anyway.',
    'In System Settings → Privacy & Security, scroll to Security. Beside “Excerpt” was blocked to protect your Mac, click Open Anyway and confirm with your password. After that it opens normally.'],
] as const;

/** A shell command to copy. The `$` prompt is drawn by CSS, so it is never copied. */
export function CommandLine({ command, label }: { command: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'selected'>('idle');
  const code = useRef<HTMLElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setState('copied');
    } catch {
      // No clipboard access: select the text so ⌘C still works, and say so.
      if (code.current) window.getSelection()?.selectAllChildren(code.current);
      setState('selected');
    }
    window.setTimeout(() => setState('idle'), 2400);
  };
  return <div className="lp-cmd">
    <code ref={code} aria-label={label}>{command}</code>
    <button onClick={copy} aria-live="polite">{state === 'copied' ? 'Copied' : state === 'selected' ? 'Press ⌘C' : 'Copy'}</button>
  </div>;
}

/** The two ways in, side by side. Shared by the landing page and the install page. */
export function InstallMethods({ guide = false }: { guide?: boolean }) {
  return <div className="lp-install">
    <article className="lp-card lp-install-card">
      <span className="lp-label">From Terminal · no prompt</span>
      <h3>Paste one line.</h3>
      <p>
        It downloads the latest release, checks that it is signed by Excerpt, and puts it in
        Applications. macOS does not stop it, because its first-open check only applies to files a
        browser downloads.
      </p>
      <CommandLine command={INSTALL_COMMAND} label="Terminal install command" />
      <p className="lp-install-meta">
        Terminal is in Applications → Utilities. <a className="lp-link" href={INSTALL_SCRIPT} target="_blank" rel="noreferrer">Read the script first ↗</a>
      </p>
    </article>
    <article className="lp-card lp-install-card lp-card-outline">
      <span className="lp-label">From the download · allow once</span>
      <h3>Download, then allow it.</h3>
      <p>
        Drag Excerpt into Applications. The first time you open it, macOS warns that it could not verify it.
        Choose Done, then Open Anyway in System Settings → Privacy & Security.
      </p>
      <a className="lp-solid lp-full" href={DOWNLOAD}>Download Excerpt.dmg <span aria-hidden>↓</span></a>
      {guide && <p className="lp-install-meta"><a className="lp-link" href="#/install">Step by step, with what each screen says →</a></p>}
    </article>
  </div>;
}

export function InstallPage() {
  return (
    <div className="lp">
      <nav className="lp-nav is-stuck" aria-label="Main">
        <a className="lp-nav-mark" href="#/" aria-label="Excerpt home"><Wordmark /></a>
        <div className="lp-nav-links">
          <a href="#/">Home</a>
          <a href={`${SOURCE}#readme`} target="_blank" rel="noreferrer">Documentation ↗</a>
          <a href={SOURCE} target="_blank" rel="noreferrer">Open source ↗</a>
        </div>
        <div className="lp-nav-actions">
          <a className="lp-solid" href={DOWNLOAD}>Download</a>
        </div>
      </nav>

      <header className="lp-section lp-centred lp-install-top">
        <div className="lp-head">
          <span className="lp-label lp-label-ember">[ Install ]</span>
          <h1>Install Excerpt <em>for Mac.</em></h1>
          <p>
            Free, and it requires {REQUIRES}. There are two ways to install it: one line in Terminal, or the
            disk image and one trip to System Settings.
          </p>
        </div>
        <InstallMethods />
      </header>

      <section className="lp-section" id="terminal">
        <div className="lp-head">
          <span className="lp-label">[ From Terminal ]</span>
          <h2>What the one line <em>does.</em></h2>
          <p>
            It runs <a className="lp-link" href={INSTALL_SCRIPT} target="_blank" rel="noreferrer">install.sh</a>,
            a short script you can read before you run it. Run it again later to update.
          </p>
        </div>
        <div className="lp-cards lp-cards-4">
          {SCRIPT_STEPS.map(([n, title, body]) => (
            <article className="lp-card lp-card-outline" key={n}>
              <span className="lp-step">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <p className="lp-note">
          It will not replace Excerpt while it is running, so a meeting in progress is never cut off. It changes no
          security setting and installs nothing else. macOS does not show its warning because it only checks files
          marked as downloaded, and curl does not mark them. The signature check is the script’s own: it confirms the app
          is the one Excerpt published, which is not the same as Apple reviewing it.
        </p>
      </section>

      <section className="lp-section" id="download">
        <div className="lp-head">
          <span className="lp-label">[ From the download ]</span>
          <h2>Opening it <em>the first time.</em></h2>
          <p>A browser marks what it downloads, so macOS stops Excerpt the first time it opens. Allowing it takes three steps, once.</p>
        </div>
        <div className="lp-cards lp-cards-3">
          {DOWNLOAD_STEPS.map(([n, title, body]) => (
            <article className="lp-card lp-card-outline" key={n}>
              <span className="lp-step">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <p className="lp-note">
          Open Anyway appears for about an hour after step 2; if it is gone, open Excerpt again. Right-clicking and
          choosing Open no longer skips this check on current macOS.
        </p>
        <div className="lp-install-alt">
          <p>Already dragged it into Applications? Instead of steps 2 and 3, this clears the download mark:</p>
          <CommandLine command={UNQUARANTINE_COMMAND} label="Command that clears the download mark" />
        </div>
      </section>

      <section className="lp-section" id="more">
        <div className="lp-cards lp-cards-3">
          <article className="lp-card lp-card-quiet">
            <h3>Why macOS warns.</h3>
            <p>
              Excerpt is signed with its own certificate, not an Apple Developer ID, and has not been notarized by
              Apple, which needs a paid developer account. So macOS cannot vouch for it, and says so. The code is
              open for anyone to check.
            </p>
          </article>
          <article className="lp-card lp-card-quiet">
            <h3>Updating.</h3>
            <p>
              Quit Excerpt and run the Terminal line again. A new download from the browser is checked again, so
              expect the Open Anyway step again. Either way, meetings stay in
              ~/Library/Application Support/Excerpt, and permissions carry over because every release is signed
              with the same certificate.
            </p>
          </article>
          <article className="lp-card lp-card-quiet">
            <h3>Build it yourself.</h3>
            <p>
              Excerpt is MIT licensed. Build the Mac app from source and it never meets the download check at all.
            </p>
            <a className="lp-outline lp-full" href={`${SOURCE}#development`} target="_blank" rel="noreferrer">Build from source ↗</a>
          </article>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-base">
          <a href="#/">← Excerpt home</a>
          <span>© {new Date().getFullYear()} Excerpt · MIT</span>
          <span>Free and open source.</span>
        </div>
      </footer>
    </div>
  );
}
