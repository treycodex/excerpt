import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LiveCaptureAdapter, applyPreferences, extractItems,
  loadPreferences, saveMeeting, savePreferences, toMarkdown,
  saveCaptureDraft, loadCaptureDraft, clearCaptureDraft,
} from '@excerpt/core';
import type { AdapterStatus, Meeting, ProcessingMode, TranscriptEvent } from '@excerpt/types';
import type { AudioInput, StreamDiagnostics } from '@excerpt/core';
import { listMicrophones, preferredMicrophone } from '@excerpt/core';
import { Captions } from './CallFrame';
import type { Spoken } from './CallFrame';
import { Strip } from '@excerpt/ui';
import { openCaptionWindow, supportsPiP } from '../pip';
import { CAPTION_PRESETS, applyPreset, currentPreset } from '../captionPreset';
import type { CaptionPreset } from '../captionPreset';

type Mode = 'tab' | 'system';
const LINGER = 3200;

const supported = () =>
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
  !!navigator.mediaDevices?.getDisplayMedia;

export function Record({ onSaved }: { onSaved: (id: string) => void }) {
  const [preset, setPreset] = useState<CaptionPreset>(() => currentPreset());
  const [status, setStatus] = useState<AdapterStatus>({ kind: 'idle' });
  const [spoken, setSpoken] = useState<Record<string, Spoken>>({});
  const [elapsed, setElapsed] = useState(0);
  const [pip, setPip] = useState<Document | null>(null);
  const [pendingMode, setPendingMode] = useState<Mode>('tab');
  const [captured, setCaptured] = useState(0);
  const [diag, setDiag] = useState<StreamDiagnostics[]>([]);
  const [mics, setMics] = useState<AudioInput[]>([]);
  const [micId, setMicId] = useState<string>('');
  const [checkingMic, setCheckingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micMessage, setMicMessage] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [unsaved, setUnsaved] = useState<Meeting | null>(null);
  const [recovered, setRecovered] = useState(false);

  const adapter = useRef<LiveCaptureAdapter | null>(null);
  const events = useRef<TranscriptEvent[]>([]);
  const startedAt = useRef<number>(0);
  const segmentOffset = useRef(0);
  const draftStartedAt = useRef(new Date().toISOString());
  const processingUsed = useRef<ProcessingMode>('on-device');
  const draftWrite = useRef<Promise<void>>(Promise.resolve());

  const checkpoint = useCallback((nextEvents: TranscriptEvent[], nextElapsed: number) => {
    const snapshot = [...nextEvents];
    draftWrite.current = draftWrite.current.catch(() => {}).then(() => saveCaptureDraft({
      id: 'active', startedAt: draftStartedAt.current, elapsed: nextElapsed,
      processing: processingUsed.current, events: snapshot,
    }));
  }, []);

  const begin = useCallback(async (mode: Mode, cloudAllowed: boolean) => {
    // Tear the previous session down first. Overwriting adapter.current leaves the
    // old recognizers running -- their restart supervisor keeps them alive, they
    // hold the on-device engine, and every later capture silently gets nothing.
    if (adapter.current) {
      await adapter.current.stop();
      adapter.current = null;
    }
    if (events.current.length === 0) draftStartedAt.current = new Date().toISOString();
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
    segmentOffset.current = elapsed;
    startedAt.current = performance.now();
    a.onStatus((next) => {
      if (adapter.current !== a) return;
      if (next.kind === 'running') processingUsed.current = next.processing;
      setStatus(next);
    });
    a.onEvent((e) => {
      if (adapter.current !== a) return;
      const adjusted = { ...e, id: `${e.sessionId}:${e.id}`, tArrived: e.tArrived + segmentOffset.current };
      if (e.isFinal) {
        events.current.push(adjusted);
        setCaptured(events.current.length);
        checkpoint(events.current, adjusted.tArrived);
      }
      setSpoken((prev) => ({
        ...prev,
        [e.role]: { text: e.text, at: performance.now(), label: e.speakerLabel, final: e.isFinal },
      }));
    });
    setPendingMode(mode);
    await a.start();
  }, [micId, elapsed, checkpoint]);

  useEffect(() => {
    if (status.kind !== 'running') return;
    const id = setInterval(() => {
      setElapsed(segmentOffset.current + performance.now() - startedAt.current);
      setDiag(Object.values(adapter.current?.diagnostics ?? {}));
    }, 200);
    return () => clearInterval(id);
  }, [status.kind]);

  useEffect(() => () => { void adapter.current?.stop(); }, []);
  useEffect(() => () => { pip?.defaultView?.close(); }, [pip]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await listMicrophones().catch(() => []);
      if (cancelled) return;
      setMics(found);
      setMicId((current) => current || preferredMicrophone(found)?.deviceId || '');
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCaptureDraft().then((draft) => {
      if (cancelled || !draft?.events.length) return;
      events.current = draft.events;
      draftStartedAt.current = draft.startedAt;
      processingUsed.current = draft.processing;
      segmentOffset.current = draft.elapsed;
      setElapsed(draft.elapsed);
      setCaptured(draft.events.length);
      setRecovered(true);
    });
    return () => { cancelled = true; };
  }, []);

  const checkMicrophone = async () => {
    setCheckingMic(true);
    setMicMessage('Listening for 3 seconds…');
    let probe: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      const found = await listMicrophones().catch(() => []);
      setMics(found);
      setMicId((current) => current || preferredMicrophone(found)?.deviceId || '');
      context = new AudioContext();
      const analyser = context.createAnalyser(); analyser.fftSize = 512;
      context.createMediaStreamSource(probe).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let peak = 0;
      await new Promise<void>((resolve) => {
        const started = performance.now();
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0; for (const sample of data) sum += sample * sample;
          const level = Math.sqrt(sum / data.length); peak = Math.max(peak, level); setMicLevel(level);
          if (performance.now() - started > 2800) { clearInterval(timer); resolve(); }
        }, 100);
      });
      setMicLevel(0);
      setMicMessage(peak > 0.01 ? 'Microphone is receiving audio.' : 'No speech detected. Try another microphone.');
    } catch {
      setMicMessage('Microphone access was not granted. You can try again when ready.');
    } finally {
      probe?.getTracks().forEach((t) => t.stop());
      await context?.close().catch(() => {});
      setMicLevel(0);
      setCheckingMic(false);
    }
  };

  const stop = async () => {
    await adapter.current?.stop();
    const captured = events.current;
    if (!captured.length) { setStatus({ kind: 'idle' }); return; }

    setSaveState('saving');
    const prefs = await loadPreferences();
    const meeting: Meeting = {
      id: `m-${Date.now()}`,
      title: `Meeting · ${new Date().toLocaleDateString()}`,
      startedAt: draftStartedAt.current,
      endedAt: new Date().toISOString(),
      processing: processingUsed.current,
      events: captured,
      items: applyPreferences(extractItems(captured, new Date()), prefs),
    };
    setUnsaved(meeting);
    try {
      await saveMeeting(meeting);
      await draftWrite.current.catch(() => {});
      await clearCaptureDraft();
      setSaveState('idle');
      setUnsaved(null);
      onSaved(meeting.id);
    } catch {
      setSaveState('failed');
      setStatus({ kind: 'idle' });
    }
  };

  const downloadUnsaved = () => {
    if (!unsaved) return;
    const url = URL.createObjectURL(new Blob([toMarkdown(unsaved)], { type: 'text/markdown' }));
    const a = document.createElement('a'); a.href = url; a.download = 'excerpt-recovered.md'; a.click();
    URL.revokeObjectURL(url);
  };

  const now = performance.now();
  const fresh = Object.values(spoken)
    .filter((s) => now - s.at < LINGER)
    .sort((a, b) => a.at - b.at);

  if (saveState === 'saving') {
    return <div className="notes"><header className="masthead"><div className="eyebrow">Excerpt</div><h1>Saving your notes…</h1><p className="rubric">The finalised transcript is still kept as a recoverable draft on this device.</p></header></div>;
  }

  if (saveState === 'failed' && unsaved) {
    return (
      <div className="notes"><header className="masthead">
        <div className="eyebrow">Excerpt</div><h1>Your notes are ready, but not saved</h1>
        <p className="rubric">This browser could not write to its meeting library. Your transcript is still here and can be retried or downloaded now.</p>
        <div className="actions"><button onClick={() => { void stop(); }}>Retry save</button><button onClick={downloadUnsaved}>Download .md</button></div>
      </header></div>
    );
  }

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
          <h1>This Mac can’t transcribe privately yet</h1>
          <p className="rubric">
            Chrome couldn’t set up the speech model that runs on your own machine.
            The only other way to transcribe is Google’s service, which means your
            meeting audio would leave this Mac. That’s your call to make, not ours.
          </p>
          <p className="rubric">
            To keep it private instead: open <code>chrome://settings/captions</code>,
            turn on Live Caption, wait for English to finish downloading, then come back.
          </p>
          <div className="actions">
            <button onClick={() => { void begin(pendingMode, true); }}>
              Use cloud transcription
            </button>
            <button
              className="primary-choice"
              onClick={async () => {
                const p = await loadPreferences();
                await savePreferences({ ...p, transcriptionChoice: 'on-device-only' }).catch(() => {});
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
            {captured > 0 && <button onClick={() => { void stop(); }}>Save captured notes</button>}
            <button onClick={() => setStatus({ kind: 'idle' })}>Back</button>
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
    const hearing = diag.some((d) => d.voicedSeconds > 1.5);
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

        <div className="live-status">
          <span className={hearing ? 'ok' : 'warn'}>
            {hearing ? 'Hearing the meeting' : 'Not hearing anything yet'}
          </span>
          <span className="dim">·</span>
          <span className={processing === 'cloud' ? 'warn' : ''}>
            {processing === 'cloud' ? 'Sent to Google to transcribe' : 'Private — nothing leaves this Mac'}
          </span>
          <span className="dim">·</span>
          <span className="dim">{captured} {captured === 1 ? 'line' : 'lines'} so far</span>
        </div>

        <details className="diagnostics">
          <summary>Details</summary>
          <dl className="credits live-credits">
            {diag.map((d) => (
              <Fragment key={d.role}>
              <dt>{d.role === 'you' ? 'Your microphone' : 'Shared audio'}</dt>
              <dd>
                <Level level={d.level} />
                <span className={d.voicedSeconds > 1 ? '' : 'warn'}>
                  {d.voicedSeconds < 1 ? 'waiting for audio' : 'receiving audio'}
                </span>
                {d.lastError && <span className="warn"> · error: {d.lastError}</span>}
                {!!d.echoesDropped && (
                  <span className="dim" title="Your microphone repeating the far side. Dropped so it cannot be mistaken for you.">
                    {' '}· {d.echoesDropped} echo{d.echoesDropped === 1 ? '' : 'es'} dropped
                  </span>
                )}
                {!d.started && <span className="warn"> · speech engine starting</span>}
              </dd>
            </Fragment>
            ))}
          </dl>
        </details>

        {diag.length > 0 && (
          <details className="diagnostics">
            <summary>Troubleshooting details</summary>
            {diag.map((d) => (
              <p key={d.role}>{d.label}: {d.device || 'default device'} · {d.voicedSeconds.toFixed(0)}s sound · {d.finals} final · {d.interims} interim · {d.restarts} restarts{d.events.length ? ` · ${d.events.slice(-4).join(' → ')}` : ''}</p>
            ))}
          </details>
        )}

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
          <div className="preset-switch" role="group" aria-label="Caption look">{CAPTION_PRESETS.map((p) => <button key={p.id} aria-pressed={preset === p.id} className={preset === p.id ? 'on' : ''} title={p.note} onClick={() => { setPreset(p.id); applyPreset(p.id, pip); }}>{p.name}</button>)}</div>
          {supportsPiP() && (
            <button onClick={async () => {
              if (pip) { pip.defaultView?.close(); setPip(null); return; }
              const doc = await openCaptionWindow();
              if (!doc) return;
              doc.defaultView?.addEventListener('pagehide', () => setPip(null));
              setPip(doc);
            }}>{pip ? 'Hide floating captions' : 'Show captions over my meeting'}</button>
          )}
          <button className="skip" onClick={() => { void stop(); }}>Finish and write my notes</button>
        </div>
      </div>
    );
  }

  return (
    <div className="notes">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        <h1>Capture a meeting</h1>
        <p className="rubric">
          Excerpt listens to what your computer is playing and to your microphone,
          keeps the two sources separate, and writes notes when you stop. Audio is not
          recorded. Transcription stays on-device by default; cloud processing is used
          only if local transcription fails and you explicitly choose it.
        </p>
        {recovered && captured > 0 && (
          <div className="draft-banner" role="status">
            <p><b>Recovered draft</b> · {captured} finalised {captured === 1 ? 'line' : 'lines'} from this device.</p>
            <div className="actions"><button onClick={() => { void stop(); }}>Write notes now</button></div>
          </div>
        )}
      </header>

      <section>
        <h2>1 · Check your microphone</h2>
        <p className="rubric setup-copy">Choose a physical microphone. Continuity and virtual devices can appear healthy while delivering silence.</p>
        <div className="mic-check-row">
          <button onClick={() => { void checkMicrophone(); }} disabled={checkingMic}>
            {checkingMic ? 'Checking…' : mics.some((m) => !!m.label) ? 'Check again' : 'Check microphone'}
          </button>
          <Level level={micLevel} />
          <span className="rubric" role="status">{micMessage || 'Permission is requested only when you check or start.'}</span>
        </div>
        <label className="mic-pick">
          <span>Microphone</span>
          <select aria-label="Microphone" value={micId} onChange={(e) => setMicId(e.target.value)}>
            {mics.length === 0 && <option value="">System default</option>}
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || 'Microphone'}{m.suspect ? ' — often captures nothing' : ''}
              </option>
            ))}
          </select>
        </label>

        <h2>2 · Choose what to share</h2>
        <div className="modes">
          <button className="mode" onClick={() => { void begin('tab', false); }}>
            <span className="mtitle">A browser tab</span>
            <span className="mmeta">
              Meet, Zoom on the web, anything playing in Chrome. Choose the meeting tab
              and tick “Also share tab audio”.
            </span>
            <span className="mwarn">Wear headphones so shared voices cannot leak back into your microphone.</span>
          </button>
          <button className="mode" onClick={() => { void begin('system', false); }}>
            <span className="mtitle">Anything on this Mac</span>
            <span className="mmeta">
              The Zoom or Teams desktop app, FaceTime, a call on speaker. Choose Entire
              Screen and tick “Share system audio”. macOS will ask for screen-recording
              permission.
            </span>
            <span className="mwarn">
              Wear headphones. Through speakers your microphone hears the meeting too,
              and Excerpt would have to guess which voice was yours. It drops what it
              can detect, but headphones remove the problem.
            </span>
          </button>
        </div>
        <p className="rubric">
          Your microphone is captured separately, which is how Excerpt can tell what you
          said from what everyone else said. It is the only thing it can tell about who
          is speaking.
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
