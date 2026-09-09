import type { AdapterStatus, TranscriptAdapter, TranscriptEvent } from '@excerpt/types';

export interface ScriptedLine {
  role: 'you' | 'remote';
  speakerLabel: string;
  text: string;
  /** ms from session start when this line finishes being spoken. */
  at: number;
}

/**
 * Replays a scripted conversation as TranscriptEvents.
 *
 * This is deliberately NOT a bag of prewritten notes: it emits the same interim +
 * final events the live adapter emits, so the demo runs the real extraction engine.
 * A regression in extraction visibly breaks the demo, which is the behaviour we want.
 */
export class DemoTranscriptAdapter implements TranscriptAdapter {
  readonly id = 'demo';
  status: AdapterStatus = { kind: 'idle' };

  private events: ((e: TranscriptEvent) => void)[] = [];
  private statuses: ((s: AdapterStatus) => void)[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private seq = 0;

  constructor(
    private readonly script: ScriptedLine[],
    private readonly sessionId: string,
    /** 1 = real time. The demo runs faster than life. */
    private readonly rate = 1,
  ) {}

  /** Every final at or before `ms`, without replaying them. Used to rebuild state after a seek. */
  finalsUpTo(ms: number): TranscriptEvent[] {
    return this.script
      .filter((l) => l.at <= ms)
      .map((l, i) => ({
        id: `demo-final-${i}`,
        sessionId: this.sessionId,
        role: l.role,
        speakerLabel: l.speakerLabel,
        text: l.text,
        isFinal: true,
        tArrived: l.at,
      }));
  }

  /** Jump to a point in the script. Anything already spoken is not replayed. */
  async seek(ms: number): Promise<void> {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.origin = ms;
    await this.start(ms);
  }

  async start(from = 0): Promise<void> {
    this.setStatus({ kind: 'starting' });
    this.origin = from;
    const wordsPerLine = 3;   // interim cadence, mimicking how SODA reveals text

    for (const line of this.script) {
      if (line.at <= from) continue;
      const words = line.text.split(' ');
      const chunks = Math.max(1, Math.ceil(words.length / wordsPerLine));
      const spoken = Math.max(600, words.length * 260);
      const begin = Math.max(0, line.at - spoken);

      for (let c = 1; c <= chunks; c++) {
        const partial = words.slice(0, Math.min(words.length, c * wordsPerLine)).join(' ');
        const when = begin + (spoken * c) / chunks;
        if (partial === line.text && c === chunks) continue;
        this.schedule(when, { ...line, text: partial, isFinal: false });
      }
      this.schedule(line.at, { ...line, text: line.text, isFinal: true });
    }

    this.setStatus({ kind: 'running', processing: 'demo' });
  }

  private origin = 0;

  private schedule(at: number, l: ScriptedLine & { isFinal: boolean }): void {
    const delay = Math.max(0, (at - this.origin) / this.rate);
    this.timers.push(
      setTimeout(() => {
        this.emit({
          id: `demo-${this.seq++}`,
          sessionId: this.sessionId,
          role: l.role,
          speakerLabel: l.speakerLabel,
          text: l.text,
          isFinal: l.isFinal,
          tArrived: at,
        });
      }, delay),
    );
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.setStatus({ kind: 'idle' });
  }

  /** Total scripted duration, for the Strip. */
  get duration(): number {
    return this.script.reduce((m, l) => Math.max(m, l.at), 0);
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
