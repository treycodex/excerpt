import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LiveCaptureAdapter, applyPreferences, extractItems,
  loadPreferences, saveMeeting, savePreferences,
} from '@excerpt/core';
import type { AdapterStatus, Meeting, ProcessingMode, TranscriptEvent } from '@excerpt/types';
import type { AudioInput, StreamDiagnostics } from '@excerpt/core';
import { listMicrophones, preferredMicrophone } from '@excerpt/core';
import { Captions } from './CallFrame';
import type { Spoken } from './CallFrame';
import { Strip } from '@excerpt/ui';
import { openCaptionWindow, supportsPiP } from '../pip';

type Mode = 'tab' | 'system';
const LINGER = 3200;

const supported = () =>
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
  !!navigator.mediaDevices?.getDisplayMedia;

export function Record({ onSaved }: { onSaved: (id: string) => void }) {
  const [status, setStatus] = useState<AdapterStatus>({ kind: 'idle' });
  const [spoken, setSpoken] = useState<Record<string, Spoken>>({});
  const [elapsed, setElapsed] = useState(0);
  const [pip, setPip] = useState<Document | null>(null);
  const [pendingMode, setPendingMode] = useState<Mode>('tab');
  const [captured, setCaptured] = useState(0);
  const [diag, setDiag] = useState<StreamDiagnostics[]>([]);
  const [mics, setMics] = useState<AudioInput[]>([]);
  const [micId, setMicId] = useState<string>('');

  const adapter = useRef<LiveCaptureAdapter | null>(null);
  const events = useRef<TranscriptEvent[]>([]);
  const startedAt = useRef<number>(0);

  const begin = useCallback(async (mode: Mode, cloudAllowed: boolean) => {
    // Tear the previous session down first. Overwriting adapter.current leaves the
    // old recognizers running -- their restart supervisor keeps them alive, they
    // hold the on-device engine, and every later capture silently gets nothing.
    if (adapter.current) {
      await adapter.current.stop();
      adapter.current = null;
    }
    const prefs = await loadPreferences();
    const a = new LiveCaptureAdapter({
      sessionId: `live-${Date.now()}`,
      captureMode: mode,
      ...(micId ? { microphoneDeviceId: micId } : {}),
      cloudAllowed: cloudAllowed || prefs.transcriptionChoice === 'cloud-allowed',
    });
    adapter.current = a;
    // Exposed for live debugging from the console during a real capture.
    (window as unknown as { __excerpt?: unknown }).__excerpt = a;
    events.current = [];
    setCaptured(0);
    a.onStatus(setStatus);
    a.onEvent((e) => {
      if (e.isFinal) { events.current.push(e); setCaptured(events.current.length); }
      setSpoken((prev) => ({
        ...prev,
        [e.role]: { text: e.text, at: performance.now(), label: e.speakerLabel },
      }));
    });
    startedAt.current = performance.now();
    setPendingMode(mode);
    await a.start();
  }, [micId]);

  useEffect(() => {
    if (status.kind !== 'running') return;
    const id = setInterval(() => {
      setElapsed(performance.now() - startedAt.current);
      setDiag(Object.values(adapter.current?.diagnostics ?? {}));
    }, 200);
    return () => clearInterval(id);
  }, [status.kind]);

  useEffect(() => () => { void adapter.current?.stop(); }, []);

  // Device labels are hidden until microphone permission is granted, so ask once
  // on arrival and release immediately. Usually silent — permission persists.
  useEffect(() => {
    if (status.kind !== 'idle') return;
    let cancelled = false;
    void (async () => {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
      } catch { /* declined; we can still list devices without labels */ }
      const found = await listMicrophones().catch(() => []);
      if (cancelled) return;
      setMics(found);
      setMicId((current) => current || preferredMicrophone(found)?.deviceId || '');
    })();
    return () => { cancelled = true; };
  }, [status.kind]);

  const stop = async () => {
    await adapter.current?.stop();
    const captured = events.current;
    if (!captured.length) { setStatus({ kind: 'idle' }); return; }

    const prefs = await loadPreferences();
    const processing: ProcessingMode =
      status.kind === 'running' ? status.processing : 'on-device';
    const meeting: Meeting = {
      id: `m-${Date.now()}`,
      title: `Meeting · ${new Date().toLocaleDateString()}`,
      startedAt: new Date(Date.now() - elapsed).toISOString(),
      endedAt: new Date().toISOString(),
      processing,
      events: captured,
      items: applyPreferences(extractItems(captured, new Date()), prefs),
    };
    await saveMeeting(meeting);
    onSaved(meeting.id);
  };

  const now = performance.now();
  const fresh = Object.values(spoken)
    .filter((s) => now - s.at < LINGER)
    .sort((a, b) => a.at - b.at);

  if (!supported()) {
    return (
      <div className="notes">
        <header className="masthead">
          <div className="eyebrow">Excerpt</div>
          <h1>This browser can’t listen</h1>
          <p className="rubric">
            Live capture needs Chrome 139 or newer on macOS. Chrome’s on-device speech
            engine and tab-audio capture do not exist in Firefox or Safari, and Excerpt
            will not pretend otherwise. The <a href="#/session">demo</a> runs anywhere.
          </p>
        </header>
      </div>
    );
  }

  if (status.kind === 'needs-consent') {
    return (
      <div className="notes">
        <header className="masthead">
          <div className="eyebrow">Excerpt</div>
          <h1>On-device transcription isn’t available</h1>
          <p className="rubric">
            Chrome could not install its local speech model, so the only way to
            transcribe here is Google’s cloud service. That means your meeting audio
            would leave this device. Excerpt will not make that choice for you.
          </p>
          <p className="rubric">
            To get on-device working instead: open <code>chrome://settings/captions</code>,
            turn on Live Caption, wait for the English pack to download, and come back.
          </p>
          <div className="actions">
            <button onClick={() => { void begin(pendingMode, true); }}>
              Use cloud transcription
            </button>
            <button
              className="primary-choice"
              onClick={async () => {
                const p = await loadPreferences();
                await savePreferences({ ...p, transcriptionChoice: 'on-device-only' });
                setStatus({ kind: 'idle' });
              }}
            >
              Continue without live capture
            </button>
          </div>
        </header>
      </div>
    );
  }

  if (status.kind === 'needs-reshare') {
    const forgotAudio = status.reason === 'no-audio-track';
    return (
      <div className="notes">
        <header className="masthead">
          <div className="eyebrow">Excerpt</div>
          <h1>{forgotAudio ? 'No audio in that share' : 'Screen sharing stopped'}</h1>
          <p className="rubric">
            {forgotAudio
              ? 'Chrome shared the picture but not the sound. In the picker, choose a tab and tick “Also share tab audio” — without it there is nothing to transcribe.'
              : 'The shared tab was closed or sharing was ended, so capture stopped. Nothing was lost; share again to carry on.'}
          </p>
          <div className="actions">
            <button onClick={() => { void begin(pendingMode, false); }}>Share again</button>
            <button onClick={() => setStatus({ kind: 'idle' })}>Cancel</button>
          </div>
        </header>
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="notes">
        <header className="masthead">
          <div className="eyebrow">Excerpt</div>
          <h1>Couldn’t start</h1>
          <p className="rubric">{status.message}</p>
          {/^That source could not be captured/.test(status.message) && (
            <p className="rubric">
              On macOS this usually means Chrome has not been granted screen recording.
              Open <code>System Settings → Privacy &amp; Security → Screen &amp; System
              Audio Recording</code>, enable Google Chrome, then <b>quit Chrome
              completely and reopen it</b> — the permission does not apply until it
              restarts.
            </p>
          )}
          <div className="actions">
            <button className="primary-choice" onClick={() => { void begin(pendingMode, false); }}>
              Try again
            </button>
            <button onClick={() => setStatus({ kind: 'idle' })}>Back</button>
          </div>
        </header>
      </div>
    );
  }

  if (status.kind === 'running' || status.kind === 'starting') {
    const processing = status.kind === 'running' ? status.processing : 'on-device';
    const heard = diag.some((d) => d.voicedSeconds > 3);
    const recognised = diag.some((d) => d.finals + d.interims > 0);
    const stalled = elapsed > 15_000 && heard && !recognised;
    const withError = diag.find((d) => d.lastError);
    const stalledHint = withError
      ? `It reported "${withError.lastError}".`
      : 'Check that the shared tab is the one making sound, and that its audio is not muted in Chrome.';
    return (
      <div className="session">
        <div className="call live">
          <div className="call-chrome">
            <span className="rec"><i /> Excerpt is listening</span>
            <span className="elapsed">{stamp(elapsed)}</span>
          </div>
          <Captions fresh={fresh} />
          {fresh.length === 0 && (
            <p className="waiting">Waiting for speech…</p>
          )}
        </div>

        <dl className="credits live-credits">
          <dt>Processing</dt>
          <dd className={processing === 'cloud' ? 'warn' : ''}>
            {processing === 'cloud' ? 'Google cloud — audio leaves this device' : 'On-device'}
          </dd>
          <dt>Captured</dt><dd>{captured} {captured === 1 ? 'line' : 'lines'}</dd>
          {diag.map((d) => (
            <Fragment key={d.role}>
              <dt>{d.role === 'you' ? 'Your microphone' : 'Shared audio'}</dt>
              <dd>
                <Level level={d.level} />
                {d.device && <span className="dim">{d.device} · </span>}
                <span className={d.voicedSeconds > 1 ? '' : 'warn'}>
                  {d.voicedSeconds < 1 ? 'no sound reaching Excerpt' : `${d.voicedSeconds.toFixed(0)}s of sound`}
                </span>
                <span className="dim"> · {d.finals} final · {d.interims} interim</span>
                {d.restarts > 0 && <span className="dim"> · {d.restarts} restarts</span>}
                {d.lastError && <span className="warn"> · error: {d.lastError}</span>}
                {d.events.length > 0 && (
                  <span className="dim trace"> · {d.events.slice(-4).join(' → ')}</span>
                )}
                {!d.started && <span className="warn"> · never started</span>}
              </dd>
            </Fragment>
          ))}
        </dl>

        {/* An honest listening indicator: if sound is arriving but nothing is being
            recognised, say so rather than showing a hopeful spinner forever. */}
        {stalled && (
          <p className="rubric stalled">
            Sound is reaching Excerpt but nothing is coming back from the speech
            engine. {stalledHint}
          </p>
        )}

        {pip && createPortal(<Captions fresh={fresh} standalone />, pip.body)}

        <div className="transport">
          <div className="transport-strip">
            <Strip duration={Math.max(elapsed, 60_000)} position={elapsed} />
          </div>
          {supportsPiP() && (
            <button onClick={async () => {
              if (pip) { pip.defaultView?.close(); setPip(null); return; }
              const doc = await openCaptionWindow();
              if (!doc) return;
              doc.defaultView?.addEventListener('pagehide', () => setPip(null));
              setPip(doc);
            }}>{pip ? 'Close float' : 'Float captions'}</button>
          )}
          <button className="skip" onClick={() => { void stop(); }}>End and write notes</button>
        </div>
      </div>
    );
  }

  return (
    <div className="notes">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        <h1>Record a meeting</h1>
        <p className="rubric">
          Excerpt listens to what your computer is playing and to your microphone,
          transcribes both on this machine, and writes notes when you stop. Nothing is
          uploaded and nothing is recorded — only the transcript is kept, here.
        </p>
      </header>

      <section>
        <h2>How should Excerpt listen?</h2>
        <div className="modes">
          <button className="mode" onClick={() => { void begin('tab', false); }}>
            <span className="mtitle">A browser tab</span>
            <span className="mmeta">
              Meet, Zoom on the web, anything playing in Chrome. Choose the meeting tab
              and tick “Also share tab audio”.
            </span>
          </button>
          <button className="mode" onClick={() => { void begin('system', false); }}>
            <span className="mtitle">Anything on this Mac</span>
            <span className="mmeta">
              The Zoom or Teams desktop app, FaceTime, a call on speaker. Choose Entire
              Screen and tick “Share system audio”. macOS will ask for screen-recording
              permission.
            </span>
          </button>
        </div>
        <label className="mic-pick">
          <span>Microphone</span>
          <select value={micId} onChange={(e) => setMicId(e.target.value)}>
            {mics.length === 0 && <option value="">System default</option>}
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label}{m.suspect ? ' — often captures nothing' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="rubric">
          Your microphone is captured separately, which is how Excerpt can tell what you
          said from what everyone else said. It is the only thing it can tell about who
          is speaking.
        </p>
        <p className="rubric">
          Check the device above. A Mac will happily default to an iPhone’s microphone
          or a virtual device installed by another app, and either one records silence
          while looking perfectly healthy.
        </p>
      </section>
    </div>
  );
}

/** A tiny level meter. Six bars is enough to tell "silent" from "speaking". */
function Level({ level }: { level: number }) {
  const bars = Math.min(6, Math.round(level * 90));
  return (
    <span className="level" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className={i < bars ? 'on' : ''} />
      ))}
    </span>
  );
}

const stamp = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
