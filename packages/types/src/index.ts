/** Who produced the audio. This says who SPOKE — never who was addressed. */
export type SourceRole = 'you' | 'remote';

export type Category  = 'decision' | 'action' | 'deadline' | 'question';
export type ItemState = 'discussed' | 'proposed' | 'decided';

/** Assignment is deliberately coarse. See the assignment rules in packages/core. */
export type Assignee = 'you' | 'unassigned';

/** Where transcription actually happened. Surfaced to the user, never hidden. */
export type ProcessingMode = 'on-device' | 'cloud' | 'demo';

/**
 * The single interface every surface consumes. Captions take interim + final;
 * extraction takes finals only.
 *
 * `tArrived` is the ONLY clock available: the Web Speech API exposes no timestamps
 * (SpeechRecognitionResult carries transcript/confidence/isFinal and nothing else),
 * so this is event-arrival time and lags real speech by recognition latency.
 * Treat it as approximate everywhere, and label it as such in the UI.
 */
export interface TranscriptEvent {
  id: string;
  sessionId: string;
  role: SourceRole;
  speakerLabel: string;
  text: string;
  isFinal: boolean;
  tArrived: number;
  confidence?: number;
}

/** A verbatim pointer back into the transcript. Quotes are never paraphrased. */
export interface Evidence {
  eventIds: string[];
  tArrived: number;
  quote: string;
  speakerLabel: string;
}

export interface Item {
  id: string;
  category: Category;
  state: ItemState;
  /** An EXTRACTIVE span of a real sentence. Never generated, never rewritten. */
  title: string;
  evidence: Evidence[];
  /** Other item ids shown as related moments. Never asserted as causal. */
  related?: string[];
  assignee: Assignee;
  due?: string;
  salience: number;
  userEdited?: boolean;
  dismissed?: boolean;
}

export interface Preferences {
  order: Category[];
  boosts: string[];
  instruction: string;
  transcriptionChoice?: 'on-device-only' | 'cloud-allowed';
}

export interface Meeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  processing: ProcessingMode;
  events: TranscriptEvent[];
  items: Item[];
}

export type AdapterStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; processing: ProcessingMode }
  | { kind: 'needs-consent'; reason: 'on-device-unavailable' }
  | { kind: 'needs-reshare'; reason: 'share-stopped' }
  | { kind: 'error'; message: string };

/** Capture is swappable; nothing downstream knows where events came from. */
export interface TranscriptAdapter {
  readonly id: string;
  readonly status: AdapterStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (e: TranscriptEvent) => void): () => void;
  onStatus(handler: (s: AdapterStatus) => void): () => void;
}
