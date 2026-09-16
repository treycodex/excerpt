import type {
  AdapterStatus, ProcessingMode, SourceRole, TranscriptAdapter, TranscriptEvent,
} from '@excerpt/types';
import { healthOf } from './health';
import type { SourceHealth, SourceSignals } from './health';

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
  /** Microphone lines discarded for repeating the far side. */
  echoesDropped?: number;
  /** Which device this stream came from. A silent Continuity mic looks identical
      to a quiet room unless the label is on screen. */
  device?: string;
  /** Seconds of voiced audio that have arrived since this stream last settled
      any text. A recognizer that dies mid-meeting is silent in every other
      measure — the counters stop moving and nothing says why. */
  voicedSinceFinal: number;
  /** Wall seconds since the last final, or since capture began. */
  sinceFinal: number;
  /** Wall seconds since a frame on this stream was last above the voice
      threshold; `Infinity` until one ever is. `voicedSeconds` is cumulative and
      never decays, so it can only answer "did this stream EVER hear anything" —
      the question a live indicator has to answer is whether it is hearing
      anything *now*. */
  sinceVoiced: number;
  /** Set when restarts were abandoned after repeated immediate failures. */
  gaveUp?: boolean;
}

/**
 * What one stream is doing, as a single word.
 *
 * The rule itself lives in `health.ts`, shared with the Mac so the two surfaces
 * cannot tell a person two different things about one meeting. This only adapts
 * a browser stream's counters onto it.
 *
 * Kept per stream on purpose. The aggregate the status row used to show — has
 * *any* stream heard *anything* — goes green on the first second of audio and
 * stays green for the rest of the meeting, so a microphone that dies beside a
 * healthy tab is indistinguishable from one that is working.
 */
function signalsOf(d: StreamDiagnostics): SourceSignals {
  return {
    started: d.started,
    // `gaveUp` is browser-specific: the restart supervisor has stopped trying.
    failed: d.gaveUp === true || d.lastError === 'audio-capture',
    secondsSinceVoiced: d.sinceVoiced,
    secondsSinceFinal: d.sinceFinal,
    voicedSecondsSinceFinal: d.voicedSinceFinal,
  };
}

export function sourceHealth(d: StreamDiagnostics): SourceHealth {
  return healthOf(signalsOf(d));
}

export function isStalled(d: StreamDiagnostics): boolean {
  return d.gaveUp === true || healthOf(signalsOf(d)) === 'stalled';
}

/**
 * Words for echo comparison, Unicode-aware.
 *
 * This stripped everything outside `[a-z0-9' ]`, so a line about Ángela or
 * Grégoire lost those tokens entirely. Enough of them and the `mine.size < 3`
 * guard short-circuits, echo suppression silently stops, and the far side is
 * transcribed twice and attributed to you — which corrupts the one thing two
 * streams exist to know. English meetings with non-English names hit this too.
 *
 * Exported for tests; not part of the package's public surface.
 */
export function echoWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ')
      .split(/\s+/).filter((w) => w.length > 2),
  );
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
    case 'InvalidStateError':
      return 'Chrome will only start sharing while this tab is visible and focused. Bring this tab to the front and try again.';
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
  /** Invalidates every continuation and timer belonging to an older start. */
  private attempt = 0;
  /** Recent remote finals, for detecting the microphone hearing the speakers. */
  private recentRemote: { text: string; at: number }[] = [];
  private echoes = 0;
  readonly diagnostics: Record<string, StreamDiagnostics> = {};

  constructor(private readonly opts: LiveCaptureOptions) {}

  async start(): Promise<void> {
    if (!SR) return this.setStatus({ kind: 'error', message: 'This browser has no SpeechRecognition.' });
    const attempt = ++this.attempt;
    this.setStatus({ kind: 'starting' });

    try {
      this.display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        ...(this.opts.captureMode === 'system' ? { systemAudio: 'include' } : {}),
        selfBrowserSurface: 'exclude',
      } as DisplayMediaStreamOptions);
    } catch (e) {
      if (attempt !== this.attempt) return;
      return this.setStatus({ kind: 'error', message: shareError(e as Error) });
    }
    if (attempt !== this.attempt) { this.display.getTracks().forEach((t) => t.stop()); return; }

    const tabTrack = this.display.getAudioTracks()[0];
    if (!tabTrack) {
      this.display.getTracks().forEach((t) => t.stop());
      this.display = undefined;
      // Distinct from share-stopped: the picture was shared but the audio box
      // was left unticked, which the Day 0 spike showed people do constantly.
      return this.setStatus({ kind: 'needs-reshare', reason: 'no-audio-track' });
    }
    // Ending the share is a first-class recoverable state.
    tabTrack.onended = () => {
      if (attempt !== this.attempt || !this.running) return;
      void this.stop().then(() => this.setStatus({ kind: 'needs-reshare', reason: 'share-stopped' }));
    };

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
      this.display?.getTracks().forEach((t) => t.stop());
      this.display = undefined;
      if (attempt !== this.attempt) return;
      return this.setStatus({ kind: 'error', message: `Microphone was declined (${(e as Error).name}).` });
    }
    if (attempt !== this.attempt) {
      this.display?.getTracks().forEach((t) => t.stop());
      this.mic.getTracks().forEach((t) => t.stop());
      this.display = undefined; this.mic = undefined;
      return;
    }

    // install() -> start() -> catch. Never available().
    let processing: ProcessingMode = 'on-device';
    let onDevice = false;
    try { onDevice = await SR.install({ langs: ['en-US'], processLocally: true }); } catch { onDevice = false; }
    if (attempt !== this.attempt) return;

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
    const remoteStarted = this.attach(tabTrack, 'remote', 'SPEAKER', processing === 'on-device', attempt);
    const micStarted = !!micTrack && this.attach(micTrack, 'you', 'YOU', processing === 'on-device', attempt);
    if (!remoteStarted || !micStarted || attempt !== this.attempt) {
      if (this.status.kind !== 'error') {
        this.setStatus({ kind: 'error', message: 'Could not start both speech sources.' });
      }
      await this.stop();
      return;
    }
    this.meter(this.display, 'remote');
    this.meter(this.mic, 'you');
    this.setStatus({ kind: 'running', processing });
  }

  /**
   * Without headphones the speakers play the far side and the microphone hears it
   * straight back, so both streams transcribe the same words. That does not merely
   * double the transcript -- it corrupts attribution, which is the one thing
   * Excerpt claims to know. Chrome's echoCancellation only cancels a WebRTC render
   * stream, not system or tab audio, so this has to be caught in text.
   */
  private static readonly ECHO_WINDOW_MS = 6000;
  private static readonly ECHO_OVERLAP = 0.6;

  private isEcho(text: string): boolean {
    const now = performance.now();
    this.recentRemote = this.recentRemote.filter(
      (r) => now - r.at < LiveCaptureAdapter.ECHO_WINDOW_MS,
    );
    const mine = echoWords(text);
    if (mine.size < 3) return false;   // too short to judge

    for (const r of this.recentRemote) {
      const theirs = echoWords(r.text);
      let hits = 0;
      mine.forEach((w) => { if (theirs.has(w)) hits++; });
      if (hits / mine.size >= LiveCaptureAdapter.ECHO_OVERLAP) return true;
    }
    return false;
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
      let lastVoicedAt: number | undefined;
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
          if (rms > 0.01) {
            d.voicedSeconds += (now - last) / 1000;
            d.voicedSinceFinal += (now - last) / 1000;
            lastVoicedAt = now;
          }
          d.sinceVoiced = lastVoicedAt === undefined ? Infinity : (now - lastVoicedAt) / 1000;
        }
        last = now;
        setTimeout(loop, 100);
      };
      loop();
    } catch {
      // A meter is diagnostic only; never let it take capture down.
    }
  }

  /**
   * How long an interim must stop growing before we treat it as settled.
   * SODA finalises on pauses, so a monologue can run 40 seconds and produce a
   * single final. Extraction reads finals only, so without this a continuous
   * speaker yields an almost empty transcript.
   */
  private static readonly SETTLE_MS = 1800;
  /** Words left uncommitted because the engine may still revise them. */
  private static readonly VOLATILE_TAIL_WORDS = 6;
  /** Never emit a dribble; wait until there is a readable amount. */
  private static readonly MIN_CHUNK_WORDS = 12;
  /** Commit at least this often even if the speaker never pauses. */
  private static readonly MAX_HOLD_MS = 6000;
  /** Restart delays, in order, until a result proves the recognizer is alive. */
  private static readonly RESTART_BACKOFF_MS = [120, 250, 500, 1000, 2000, 4000, 8000];
  /** Consecutive fruitless restarts before the stream is left alone. */
  private static readonly RESTART_GIVE_UP = 12;

  private attach(
    track: MediaStreamTrack, role: SourceRole, label: string, local: boolean, attempt: number,
  ): boolean {
    const rec = new SR!();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    try { rec.processLocally = local; } catch { /* older builds */ }

    const entry = { rec, track, stopping: false };
    const key = role;
    this.diagnostics[key] = {
      role, label, level: 0, voicedSeconds: 0, voicedSinceFinal: 0, sinceFinal: 0,
      sinceVoiced: Infinity,
      finals: 0, interims: 0, restarts: 0, started: false, events: [], echoesDropped: 0,
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

    // Interim text within one utterance is cumulative. SODA finalises only on
    // pauses, so 104 seconds of continuous speech once produced four transcript
    // rows, one of them 180 words under a single timestamp. We therefore commit a
    // stable prefix as we go, leaving a short volatile tail the engine may revise.
    let words: string[] = [];
    let committed = 0;
    let lastGrowth = performance.now();
    let lastCommit = performance.now();
    let lastFinalAt = performance.now();
    /** Restarts since this stream last produced anything at all. */
    let failedRestarts = 0;

    const send = (text: string, isFinal: boolean, confidence?: number) => {
      if (!text) return;

      if (isFinal) {
        if (role === 'remote') {
          this.recentRemote.push({ text, at: performance.now() });
        } else if (this.isEcho(text)) {
          // The microphone repeating the far side. Dropping it protects
          // attribution; a genuine echo is never worth a wrong assignment.
          this.echoes++;
          const d = this.diagnostics[key];
          if (d) d.echoesDropped = this.echoes;
          trace('dropped echo');
          return;
        }
      }

      this.emit({
        id: `live-${this.seq++}`,
        sessionId: this.opts.sessionId,
        role,
        speakerLabel: label,
        text,
        isFinal,
        tArrived: performance.now() - this.t0,
        ...(confidence !== undefined ? { confidence } : {}),
      });
    };

    /** Prefer cutting after a sentence, so rows read as speech rather than slices. */
    const cutPoint = (upto: number): number => {
      for (let i = upto - 1; i >= Math.max(committed + 1, upto - 10); i--) {
        if (/[.!?]$/.test(words[i] ?? '')) return i + 1;
      }
      return upto;
    };

    const commit = (upto: number, why: string) => {
      const cut = why === 'final' || why === 'pause' ? upto : cutPoint(upto);
      const text = words.slice(committed, cut).join(' ').trim();
      if (!text) return;
      send(text, true);
      const d = this.diagnostics[key];
      if (d) {
        d.finals++;
        d.voicedSinceFinal = 0;
        d.sinceFinal = 0;
      }
      lastFinalAt = performance.now();
      trace(`committed ${cut - committed}w (${why})`);
      committed = cut;
      lastCommit = performance.now();
    };

    const tick = () => {
      if (!this.running || attempt !== this.attempt) return;
      const now = performance.now();
      const d = this.diagnostics[key];
      if (d) d.sinceFinal = (now - lastFinalAt) / 1000;
      const pending = words.length - committed;
      if (pending > 0 && now - lastGrowth > LiveCaptureAdapter.SETTLE_MS) {
        commit(words.length, 'pause');
      } else if (pending >= LiveCaptureAdapter.MIN_CHUNK_WORDS + LiveCaptureAdapter.VOLATILE_TAIL_WORDS
                 && now - lastCommit > LiveCaptureAdapter.MAX_HOLD_MS) {
        commit(words.length - LiveCaptureAdapter.VOLATILE_TAIL_WORDS, 'continuous');
      }
      setTimeout(tick, 500);
    };
    setTimeout(tick, 500);

    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      const text = String(r[0].transcript).trim();
      const d = this.diagnostics[key];
      // Interims only. A final result is counted where it is actually committed —
      // counting it here as well reported twice the finals on the one panel whose
      // job is saying whether capture is healthy. Not every final result emits a
      // row either: when a continuous commit has already taken the words, commit()
      // returns without sending, and no final row is what the reader should see.
      if (d && !r.isFinal) d.interims++;
      if (d && d.interims + d.finals <= 3) trace(r.isFinal ? 'FIRST FINAL' : 'first interim');
      if (!text) return;

      failedRestarts = 0;   // it produced something: the restart streak is over
      const next = text.split(/\s+/).filter(Boolean);
      if (next.length > words.length) lastGrowth = performance.now();
      words = next;

      if (r.isFinal) {
        commit(words.length, 'final');
        words = [];
        committed = 0;
        lastGrowth = performance.now();
        return;
      }
      send(text, false);   // captions still see the whole live interim
    };

    rec.onerror = (e: any) => {
      // Record every error. Swallowing the non-fatal ones made a broken capture
      // look identical to a quiet room.
      const d = this.diagnostics[key];
      trace(`ERROR ${e.error}`);
      const deliberate = e.error === 'aborted' && !this.running;
      if (d && e.error !== 'no-speech' && !deliberate) d.lastError = String(e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        const message = `Recognition was blocked (${e.error}).`;
        void this.stop().then(() => this.setStatus({ kind: 'error', message }));
      }
      // The device itself is gone. Restarting against it cannot help.
      if (e.error === 'audio-capture') {
        entry.stopping = true;
        if (d) { d.gaveUp = true; d.lastError = 'audio-capture'; }
      }
      if (e.error === 'language-not-supported') {
        void this.stop().then(() => this.setStatus({ kind: 'needs-consent', reason: 'on-device-unavailable' }));
      }
    };

    // Web Speech stops itself (~60s idle, no-speech). Restart, but never against
    // a dead track — that throws InvalidStateError.
    //
    // Backed off, and given up on. A restart that fails the same way it did last
    // time will keep failing: a persistent `network` error ends the recognizer,
    // which restarts it, which errors again, at eight attempts a second for the
    // rest of the meeting — burning the machine and hammering the service while
    // the screen still says Excerpt is listening. The streak is cleared by the
    // first result to arrive, so an ordinary idle stop still restarts at once.
    rec.onend = () => {
      if (!this.running || attempt !== this.attempt || entry.stopping || track.readyState !== 'live') return;
      const d = this.diagnostics[key]; if (d) d.restarts++;

      if (failedRestarts >= LiveCaptureAdapter.RESTART_GIVE_UP) {
        if (d) { d.gaveUp = true; d.lastError ??= 'recognition stopped restarting'; }
        trace(`gave up after ${failedRestarts} restarts`);
        return;
      }

      const delay = LiveCaptureAdapter.RESTART_BACKOFF_MS[
        Math.min(failedRestarts, LiveCaptureAdapter.RESTART_BACKOFF_MS.length - 1)
      ]!;
      failedRestarts++;
      trace(`restarting in ${delay}ms`);
      setTimeout(() => {
        if (!this.running || attempt !== this.attempt || entry.stopping || track.readyState !== 'live') return;
        try { rec.start(track); } catch { /* track died mid-restart */ }
      }, delay);
    };

    trace(`start(track ${track.kind}/${track.readyState})`);
    try { rec.start(track); } catch (err) {
      trace(`start threw ${(err as Error).name}`);
      this.setStatus({ kind: 'error', message: `Could not start recognition: ${(err as Error).message}` });
      entry.stopping = true;
      return false;
    }
    this.recognizers.push(entry);
    return true;
  }

  async stop(): Promise<void> {
    this.attempt++;
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
