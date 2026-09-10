import type {
  AdapterStatus, ProcessingMode, SourceRole, TranscriptAdapter, TranscriptEvent,
} from '@excerpt/types';

/* Chrome-only surface. Typed here because TS lib.dom does not yet carry it. */
interface SpeechRecognitionLike extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; processLocally: boolean;
  start(track?: MediaStreamTrack): void;
  stop(): void;
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

export interface LiveCaptureOptions {
  sessionId: string;
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
      return this.setStatus({ kind: 'error', message: `Screen share was declined (${(e as Error).name}).` });
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
        audio: { echoCancellation: true, noiseSuppression: true },
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
    this.setStatus({ kind: 'running', processing });
  }

  private attach(track: MediaStreamTrack, role: SourceRole, label: string, local: boolean): void {
    const rec = new SR!();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    try { rec.processLocally = local; } catch { /* older builds */ }

    const entry = { rec, track, stopping: false };

    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      const text = String(r[0].transcript).trim();
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
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.running = false;
        this.setStatus({ kind: 'error', message: `Recognition was blocked (${e.error}).` });
      }
    };

    // Web Speech stops itself (~60s idle, no-speech). Restart, but never against
    // a dead track — that throws InvalidStateError.
    rec.onend = () => {
      if (!this.running || entry.stopping || track.readyState !== 'live') return;
      setTimeout(() => { try { rec.start(track); } catch { /* track died mid-restart */ } }, 120);
    };

    try { rec.start(track); } catch (err) {
      this.setStatus({ kind: 'error', message: `Could not start recognition: ${(err as Error).message}` });
    }
    this.recognizers.push(entry);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const e of this.recognizers) { e.stopping = true; try { e.rec.stop(); } catch { /* already stopped */ } }
    this.recognizers = [];
    this.display?.getTracks().forEach((t) => t.stop());
    this.mic?.getTracks().forEach((t) => t.stop());
    this.display = undefined;
    this.mic = undefined;
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
