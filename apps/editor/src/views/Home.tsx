import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { bridge, readMeetingLibrary } from '@excerpt/core';
import type { DesktopSettings, LiveMeetingStatus, MeetingLibraryEntry } from '@excerpt/types';
import { Icon, type IconName } from '@excerpt/ui';
import { Wordmark } from './Wordmark';
import './home.css';

const IDLE: LiveMeetingStatus = { phase: 'idle', status: 'Not listening' };
const RECENT = 4;

/** 4:07, or 1:02:07 past the hour. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function when(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Capture names unnamed meetings `Meeting · <date>`; the date column already says that. */
const untitled = (title: string) => /^Meeting · /.test(title);

/** "32 min · 3 notes" — what a row holds, so fragments of speech read as meetings. */
function detail(m: MeetingLibraryEntry): string {
  const parts: string[] = [];
  if (m.endedAt) {
    const minutes = Math.round((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 60000);
    parts.push(minutes < 1 ? 'Under a minute' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`);
  }
  if (m.noteCount) parts.push(`${m.noteCount} ${m.noteCount === 1 ? 'note' : 'notes'}`);
  return parts.join(' · ');
}

function Switch({ icon, label, detail, checked, disabled, onChange }: {
  icon: IconName; label: string; detail: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="home-row home-switch"
      disabled={disabled} onClick={() => onChange(!checked)}>
      <Icon name={icon} />
      <span><b>{label}</b><small>{detail}</small></span>
      <i aria-hidden />
    </button>
  );
}

/**
 * What opening Excerpt shows: whether a meeting is running, the one control that
 * matters right now, three switches, and the last few meetings. Everything else is a
 * link away. Native owns every value here; the page only renders and asks.
 */
export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [recent, setRecent] = useState<MeetingLibraryEntry[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(false);

  const meeting = settings?.meeting ?? IDLE;
  const live = meeting.phase !== 'idle';

  useEffect(() => {
    mounted.current = true;
    const receive = (event: Event) => setSettings((event as CustomEvent<DesktopSettings>).detail);
    window.addEventListener('excerpt:desktop-settings', receive);
    void bridge()?.loadDesktopSettings().then((value) => { if (mounted.current) setSettings(value); })
      .catch(() => { if (mounted.current) setError('Excerpt’s settings could not be read. Try reopening the window.'); });
    return () => { mounted.current = false; window.removeEventListener('excerpt:desktop-settings', receive); };
  }, []);

  // Re-read when a meeting starts or is saved, so the one just finished is listed.
  useEffect(() => {
    let current = true;
    void readMeetingLibrary().then((result) => { if (current) setRecent(result.meetings.slice(0, RECENT)); })
      .catch(() => { if (current) setRecent([]); });
    return () => { current = false; };
  }, [meeting.phase]);

  useEffect(() => {
    if (meeting.phase !== 'live') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [meeting.phase]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'That did not work. Try the Excerpt menu.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const host = bridge();
  const start = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => { await host?.startMeeting(title.trim() || undefined); setTitle(''); });
  };
  const end = () => { void run(async () => { await host?.endMeeting?.(); }); };
  const openTranscript = () => { void run(async () => { await host?.openLiveNotes(); }); };
  const setCaptions = (enabled: boolean) => {
    void run(async () => { const next = await host?.saveCaptionSettings({ enabled }); if (next) setSettings(next); });
  };
  const setNotice = (enabled: boolean) => {
    void run(async () => { const next = await host?.setNoticeMeetings?.(enabled); if (next) setSettings(next); });
  };

  const shortcut = settings?.shortcuts.find((s) => s.name === 'meeting' && s.registered)?.shortcut;
  const microphone = settings?.microphone.devices.find((d) => d.id === settings.microphone.selectedDeviceId)?.name;
  const state = meeting.phase === 'live' && meeting.startedAt
    ? `Live · ${elapsed(now - new Date(meeting.startedAt).getTime())}`
    : meeting.phase === 'starting' ? 'Starting…' : meeting.phase === 'finishing' ? 'Saving…' : 'Ready';

  return (
    <div className="home">
      {/* The window hides its own title, so the wordmark is the name beside the lights. */}
      <nav className="home-bar" aria-label="Excerpt">
        <a className="home-brand" href="#/home" aria-label="Excerpt home"><Wordmark /></a>
        <a href="#/meetings">Meetings</a><a href="#/preferences">Settings</a>
      </nav>

      <div className="home-column">
        <section className={`home-now ${meeting.phase}`} aria-live="polite">
          <div className="home-state">{live ? <i aria-hidden /> : <Icon name="clapper" />}{state}</div>
          {!live ? (
            <form onSubmit={start}>
              {/* The site's headline shape: grotesk, then a serif turn at the end. */}
              <h1>Ready when <em>you are.</em></h1>
              <div className="home-composer">
                <input aria-label="Meeting name" placeholder="Name this meeting (optional)"
                  value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
                <button type="submit" className="home-primary" disabled={busy || !host}>Start meeting</button>
              </div>
              <p className="home-hint">
                {shortcut ? <>Or press <kbd>{shortcut}</kbd> from anywhere.</> : 'Or use the Excerpt menu in the menu bar.'}
                {settings?.noticeMeetings && ' Excerpt also asks when a call starts.'}
              </p>
            </form>
          ) : (
            <>
              <h1>{meeting.title || 'This meeting'}</h1>
              <p className="home-hint">{[meeting.app && `In ${meeting.app}`, meeting.status].filter(Boolean).join(' · ')}</p>
              <div className="home-start">
                <button type="button" className="home-primary" onClick={end}
                  disabled={busy || meeting.phase !== 'live' || !host?.endMeeting}>End meeting</button>
                <button type="button" onClick={openTranscript} disabled={busy || meeting.phase !== 'live'}>Open transcript</button>
              </div>
            </>
          )}
          {error && <p className="home-error" role="alert">{error}</p>}
        </section>

        <section className="home-recent" aria-label="Recent meetings">
          <header><span><Icon name="reel" />Recent</span><a href="#/meetings">All meetings →</a></header>
          {recent === null ? <p>Reading…</p>
            : recent.length === 0 ? <p>Your meetings will appear here.</p>
            : recent.map((m) => (
              <button key={m.id} type="button" onClick={() => onOpen(m.id)}>
                <span className={untitled(m.title) ? 'untitled' : undefined}>
                  {untitled(m.title) ? 'Untitled meeting' : m.title}
                  {detail(m) && <small>{detail(m)}</small>}
                </span>
                <time dateTime={m.startedAt}>{!m.endedAt && m.draftRevision !== undefined ? 'Live' : when(m.startedAt)}</time>
              </button>
            ))}
        </section>

        {settings && (
          <section className="home-controls" aria-label="Controls">
            <header><span><Icon name="projector" />Setup</span></header>
            <div className="home-panel">
              <Switch icon="subtitles" label="Captions" detail="Subtitles over your screen while a meeting runs"
                checked={settings.captions.enabled} disabled={busy} onChange={setCaptions} />
              {settings.noticeMeetings !== undefined && host?.setNoticeMeetings && (
                <Switch icon="record" label="Notice meetings" detail="Ask to start when Zoom, Meet or Teams uses the mic"
                  checked={settings.noticeMeetings} disabled={busy} onChange={setNotice} />
              )}
              <a className="home-row" href="#/preferences">
                <Icon name="mic" />
                <span><b>Microphone</b><small>{microphone ?? 'None selected'} · {settings.microphone.message}</small></span>
                <em>Change</em>
              </a>
            </div>
          </section>
        )}

        <ul className="home-trust" aria-label="About Excerpt">
          <li><Icon name="seat" /> Meetings saved on this Mac</li>
          <li><Icon name="ticket" /> Free, no account</li>
        </ul>
      </div>
    </div>
  );
}
