import { useRef, useState } from 'react';
import { Wordmark } from './Wordmark';
import './landing.css';
import { DOWNLOAD, INSTALL_COMMAND, INSTALL_SCRIPT, REQUIRES, SOURCE, UNQUARANTINE_COMMAND } from './site';

/* ── Installing ────────────────────────────────────────────────────────────────
   Explain the two installation paths plainly, including the macOS approval
   needed for a browser download and what the Terminal script verifies. */

/** What the Terminal line does, in the order install.sh does it. */
const SCRIPT_STEPS = [
  ['01', 'Checks this Mac.',
    'The installer stops unless you have an Apple silicon Mac running macOS 26 or later.'],
  ['02', 'Downloads the latest release.',
    'It gets the same Excerpt.dmg as the Download button, from GitHub Releases.'],
  ['03', 'Checks the signature.',
    'It checks the app against Excerpt’s pinned signing certificate. A mismatch stops the install.'],
  ['04', 'Installs and opens it.',
    'It copies Excerpt into Applications and opens it. If needed, it uses the Applications folder in your home folder.'],
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
      <span className="lp-label">Terminal installer</span>
      <h3>Read it, then run it.</h3>
      <p>
        The script downloads the latest release, checks its signature, and installs the app.
        Read the script before running the command.
      </p>
      <CommandLine command={INSTALL_COMMAND} label="Terminal install command" />
      <p className="lp-install-meta">
        Terminal is in Applications → Utilities. <a className="lp-link" href={INSTALL_SCRIPT} target="_blank" rel="noreferrer">Read the script first ↗</a>
      </p>
    </article>
    <article className="lp-card lp-install-card lp-card-outline">
      <span className="lp-label">Disk image</span>
      <h3>Download the app.</h3>
      <p>
        Drag Excerpt into Applications. Because it is not notarized, macOS asks you to approve
        the first launch in System Settings → Privacy & Security.
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
            Excerpt is free and requires {REQUIRES}. Choose the disk image or the Terminal installer.
            The steps for each are below.
          </p>
        </div>
        <InstallMethods />
      </header>

      <section className="lp-section" id="terminal">
        <div className="lp-head">
          <span className="lp-label">[ From Terminal ]</span>
          <h2>What the script <em>does.</em></h2>
          <p>
            The command runs <a className="lp-link" href={INSTALL_SCRIPT} target="_blank" rel="noreferrer">install.sh</a>.
            Read it first. Run it again later to update Excerpt.
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
          The script will not replace Excerpt while it is running. Terminal downloads do not carry the
          quarantine mark a browser adds, so macOS does not show its usual first-open warning. The
          script checks the app’s signature instead; that is not Apple notarization. Only run a script
          you trust and have reviewed.
        </p>
      </section>

      <section className="lp-section" id="download">
        <div className="lp-head">
          <span className="lp-label">[ From the download ]</span>
          <h2>Open the download <em>once.</em></h2>
          <p>macOS asks you to approve the first launch of this unnotarized app. Follow these steps after downloading the disk image.</p>
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
          <p>You can also clear the download mark manually, but that skips the macOS approval described above:</p>
          <CommandLine command={UNQUARANTINE_COMMAND} label="Command that clears the download mark" />
        </div>
      </section>

      <section className="lp-section" id="more">
        <div className="lp-cards lp-cards-3">
          <article className="lp-card lp-card-quiet">
            <h3>Why macOS warns.</h3>
            <p>
              Excerpt uses a local signing certificate, not an Apple Developer ID, and has not been notarized.
              macOS cannot verify it through Apple’s usual process. The source code is available to inspect.
            </p>
          </article>
          <article className="lp-card lp-card-quiet">
            <h3>Updating.</h3>
            <p>
              Quit Excerpt, then run the Terminal installer again or download the latest disk image.
              A browser download needs macOS approval again. Your meetings stay in
              ~/Library/Application Support/Excerpt.
            </p>
          </article>
          <article className="lp-card lp-card-quiet">
            <h3>Build it yourself.</h3>
            <p>
              Excerpt is MIT licensed. You can inspect the code and build the Mac app yourself.
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
