import type {
  AdapterStatus, ProcessingMode, SourceRole, TranscriptAdapter, TranscriptEvent,
} from '@excerpt/types';

/* Chrome-only surface. Typed here because TS lib.dom does not yet carry it. */
interface SpeechRecognitionLike extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; processLocally: boolean;
  start(track?: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
  install(o: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}
const SR: SpeechRecognitionCtor | undefined =
  (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

/**
 * Per-stream health. Without this, "no captions" is indistinguishable from a silent
 * track, a dead recognizer, or a recognizer erroring in a loop — and the UI cannot
 * honestly claim to be listening.
 */
export interface StreamDiagnostics {
  role: SourceRole;
  label: string;
  /** 0..1 RMS of the last analysis frame. */
  level: number;
  /** Seconds of audio above the voice threshold since capture began. */
  voicedSeconds: number;
  finals: number;
  interims: number;
  restarts: number;
  started: boolean;
  lastError?: string;
  /** Recognizer lifecycle, newest last. The only way to see what a silent
      recognizer was actually doing. */
  events: string[];
  /** Which device this stream came from. A silent Continuity mic looks identical
      to a quiet room unless the label is on screen. */
  device?: string;
}

export interface LiveCaptureOptions {
  sessionId: string;
  /** Explicit microphone. Without one the browser default may be a Continuity or
      virtual device that captures nothing. */
  microphoneDeviceId?: string;
  /** Set once the user has explicitly chosen cloud. Never inferred. */
  cloudAllowed?: boolean;
  captureMode?: 'tab' | 'system';
}

/**
 * Tab/system audio + microphone -> two on-device recognizers -> TranscriptEvents.
 *
 * Everything here is shaped by the Day 0 spike:
 *  - available() is never called. It reported "unavailable" on a machine where
 *    install() then returned true and recognition worked (Chromium 444393111).
 *  - Two concurrent recognizers were verified to work, so the tab/mic split — and
 *    with it source separation — survives.
 *  - The restart supervisor checks track.readyState. Restarting against a dead
 *    track throws InvalidStateError.
 *  - Ending the screen share is a recoverable product state, not an error.
 */
/**
 * getDisplayMedia failures are not all "you said no", and saying so sends people
 * looking in the wrong place. NotReadableError in particular means the source
 * could not be handed over -- usually because something else is already capturing it.
 */
function shareError(e: Error): string {
  switch (e.name) {
    case 'NotAllowedError':
      return 'Screen sharing was cancelled. Choose the meeting tab and tick "Also share tab audio".';
    case 'NotReadableError':
      return 'That source could not be captured. Something else is probably already sharing it — close any other Excerpt tab or stop the existing share, then try again.';
    case 'NotFoundError':
      return 'No shareable source was found.';
    case 'AbortError':
      return 'Sharing stopped before it started. Try again.';
    case 'OverconstrainedError':
      return 'That source cannot provide audio. Choose a tab rather than a window.';
    default:
      return `Screen sharing failed (${e.name}: ${e.message}).`;
  }
}

export class LiveCaptureAdapter implements TranscriptAdapter {
  readonly id = 'live';
  status: AdapterStatus = { kind: 'idle' };

  private display: MediaStream | undefined;
  private mic: MediaStream | undefined;
  private recognizers: { rec: SpeechRecognitionLike; track: MediaStreamTrack; stopping: boolean }[] = [];
  private events: ((e: TranscriptEvent) => void)[] = [];
  private statuses: ((s: AdapterStatus) => void)[] = [];
  private running = false;
  private seq = 0;
  private t0 = 0;
  private audio: AudioContext | undefined;
  readonly diagnostics: Record<string, StreamDiagnostics> = {};

  constructor(private readonly opts: LiveCaptureOptions) {}

  async start(): Promise<void> {
    if (!SR) return this.setStatus({ kind: 'error', message: 'This browser has no SpeechRecognition.' });
    this.setStatus({ kind: 'starting' });

    try {
      this.display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        ...(this.opts.captureMode === 'system' ? { systemAudio: 'include' } : {}),
        selfBrowserSurface: 'exclude',
      } as DisplayMediaStreamOptions);
    } catch (e) {
      return this.setStatus({ kind: 'error', message: shareError(e as Error) });
    }

    const tabTrack = this.display.getAudioTracks()[0];
    if (!tabTrack) {
      this.display.getTracks().forEach((t) => t.stop());
      this.display = undefined;
      // Distinct from share-stopped: the picture was shared but the audio box
      // was left unticked, which the Day 0 spike showed people do constantly.
      return this.setStatus({ kind: 'needs-reshare', reason: 'no-audio-track' });
    }
    // Ending the share is a first-class recoverable state.
    tabTrack.onended = () => { void this.stop(); this.setStatus({ kind: 'needs-reshare', reason: 'share-stopped' }); };

    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(this.opts.microphoneDeviceId
            ? { deviceId: { exact: this.opts.microphoneDeviceId } }
            : {}),
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (e) {
      return this.setStatus({ kind: 'error', message: `Microphone was declined (${(e as Error).name}).` });
    }

    // install() -> start() -> catch. Never available().
    let processing: ProcessingMode = 'on-device';
    let onDevice = false;
    try { onDevice = await SR.install({ langs: ['en-US'], processLocally: true }); } catch { onDevice = false; }

    if (!onDevice) {
      if (!this.opts.cloudAllowed) {
        await this.stop();
        return this.setStatus({ kind: 'needs-consent', reason: 'on-device-unavailable' });
      }
      processing = 'cloud';
    }

    this.t0 = performance.now();
    this.running = true;
    const micTrack = this.mic.getAudioTracks()[0];
    this.attach(tabTrack, 'remote', 'SPEAKER', processing === 'on-device');
    if (micTrack) this.attach(micTrack, 'you', 'YOU', processing === 'on-device');
    this.meter(this.display, 'remote');
    this.meter(this.mic, 'you');
    this.setStatus({ kind: 'running', processing });
  }

  /** RMS meter per stream: distinguishes "nothing said" from "nothing arriving". */
  private meter(stream: MediaStream, key: string): void {
    try {
      this.audio ??= new AudioContext();
      const analyser = this.audio.createAnalyser();
      analyser.fftSize = 512;
      this.audio.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let last = performance.now();
      const loop = () => {
        if (!this.running) return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        const d = this.diagnostics[key];
        if (d) {
          d.level = rms;
          if (rms > 0.01) d.voicedSeconds += (now - last) / 1000;
        }
        last = now;
        setTimeout(loop, 100);
      };
      loop();
    } catch {
      // A meter is diagnostic only; never let it take capture down.
    }
  }

  private attach(track: MediaStreamTrack, role: SourceRole, label: string, local: boolean): void {
    const rec = new SR!();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    try { rec.processLocally = local; } catch { /* older builds */ }

    const entry = { rec, track, stopping: false };
    const key = role;
    this.diagnostics[key] = {
      role, label, level: 0, voicedSeconds: 0,
      finals: 0, interims: 0, restarts: 0, started: false, events: [],
      ...(track.label ? { device: track.label } : {}),
    };

    const trace = (what: string) => {
      const d = this.diagnostics[key];
      if (!d) return;
      d.events.push(`${((performance.now() - this.t0) / 1000).toFixed(1)}s ${what}`);
      if (d.events.length > 40) d.events.shift();
    };
    for (const k of ['start', 'audiostart', 'soundstart', 'speechstart',
                     'speechend', 'soundend', 'audioend', 'end', 'nomatch']) {
      rec.addEventListener(k, () => trace(k));
    }
    rec.addEventListener('start', () => {
      const d = this.diagnostics[key]; if (d) d.started = true;
    });

    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      const text = String(r[0].transcript).trim();
      const d = this.diagnostics[key];
      if (d) { if (r.isFinal) d.finals++; else d.interims++; }
      if (d && d.interims + d.finals <= 3) trace(r.isFinal ? 'FIRST FINAL' : 'first interim');
      if (!text) return;
      this.emit({
        id: `live-${this.seq++}`,
        sessionId: this.opts.sessionId,
        role,
        speakerLabel: label,
        text,
        isFinal: !!r.isFinal,
        tArrived: performance.now() - this.t0,
        confidence: typeof r[0].confidence === 'number' ? r[0].confidence : undefined,
      });
    };

    rec.onerror = (e: any) => {
      // Record every error. Swallowing the non-fatal ones made a broken capture
      // look identical to a quiet room.
      const d = this.diagnostics[key];
      trace(`ERROR ${e.error}`);
      if (d && e.error !== 'no-speech') d.lastError = String(e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.running = false;
        this.setStatus({ kind: 'error', message: `Recognition was blocked (${e.error}).` });
      }
      if (e.error === 'language-not-supported') {
        this.running = false;
        this.setStatus({ kind: 'needs-consent', reason: 'on-device-unavailable' });
      }
    };

    // Web Speech stops itself (~60s idle, no-speech). Restart, but never against
    // a dead track — that throws InvalidStateError.
    rec.onend = () => {
      if (!this.running || entry.stopping || track.readyState !== 'live') return;
      const d = this.diagnostics[key]; if (d) d.restarts++;
      trace('restarting');
      setTimeout(() => { try { rec.start(track); } catch { /* track died mid-restart */ } }, 120);
    };

    trace(`start(track ${track.kind}/${track.readyState})`);
    try { rec.start(track); } catch (err) {
      trace(`start threw ${(err as Error).name}`);
      this.setStatus({ kind: 'error', message: `Could not start recognition: ${(err as Error).message}` });
    }
    this.recognizers.push(entry);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const e of this.recognizers) {
      e.stopping = true;
      // abort() releases the engine immediately; stop() waits to finalise and can
      // leave the session held long enough to starve the next capture.
      try { e.rec.abort(); } catch { /* not started */ }
      try { e.rec.stop(); } catch { /* already stopped */ }
    }
    this.recognizers = [];
    this.display?.getTracks().forEach((t) => t.stop());
    this.mic?.getTracks().forEach((t) => t.stop());
    this.display = undefined;
    this.mic = undefined;
    void this.audio?.close().catch(() => {});
    this.audio = undefined;
    if (this.status.kind === 'running') this.setStatus({ kind: 'idle' });
  }

  onEvent(h: (e: TranscriptEvent) => void): () => void {
    this.events.push(h);
    return () => { this.events = this.events.filter((x) => x !== h); };
  }

  onStatus(h: (s: AdapterStatus) => void): () => void {
    this.statuses.push(h);
    return () => { this.statuses = this.statuses.filter((x) => x !== h); };
  }

  private emit(e: TranscriptEvent): void { for (const h of this.events) h(e); }
  private setStatus(s: AdapterStatus): void { this.status = s; for (const h of this.statuses) h(s); }
}
