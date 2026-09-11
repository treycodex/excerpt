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
  /**
   * Audio-aligned position on the meeting clock, in seconds from the start.
   *
   * Present only where the recogniser reports one. macOS `SpeechTranscriber` gives
   * every result an `audioTimeRange`; the Web Speech API gives nothing at all, so on
   * the website these stay undefined and `tArrived` remains the only clock. Timing is
   * audio-aligned where these exist and arrival-approximate where they do not — never
   * describe it as exact.
   */
  tStart?: number;
  tEnd?: number;
  originalText?: string;
  corrections?: { text: string; correctedAt: string }[];
}

/** A verbatim pointer back into the transcript. Quotes are never paraphrased. */
export interface Evidence {
  eventIds: string[];
  tArrived: number;
  quote: string;
  speakerLabel: string;
  /** Audio-aligned start, seconds, where the source provided one. See TranscriptEvent. */
  tStart?: number;
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
  completed?: boolean;
  confirmed?: boolean;
  needsReview?: boolean;
}

export interface NoteBullet {
  id: string;
  text: string;
  evidence: Evidence[];
  userEdited?: boolean;
}

export interface NoteTopic {
  id: string;
  title: string;
  bullets: NoteBullet[];
}

export interface NotesDocument {
  version: 1;
  method: 'extractive' | 'on-device';
  /**
   * Why these are the transcript-based notes rather than the summarized ones.
   *
   * Set only when a host tried the optional on-device summary and it was
   * unavailable, timed out, or produced nothing a quote supported. The reader is
   * told which of the two they are holding and why, instead of being left to
   * wonder why a set of notes came out thinner than the last.
   */
  notice?: string;
  keyPoints: NoteBullet[];
  topics: NoteTopic[];
  /** Ordered, freely editable document. Legacy sections remain readable. */
  blocks?: NoteBlock[];
}

export interface MeetingImage {
  id: string;
  dataUrl: string;
  capturedAt: string;
  /** Milliseconds on the meeting clock; independent of document position. */
  at: number;
  caption: string;
}

export interface NoteBlock {
  id: string;
  kind: 'paragraph' | 'heading' | 'bullet' | 'image';
  text: string;
  evidence: Evidence[];
  at?: number;
  imageId?: string;
  userEdited?: boolean;
  needsReview?: boolean;
  indent?: number;
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
  notes?: NotesDocument;
  images?: MeetingImage[];
}

export type AdapterStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; processing: ProcessingMode }
  | { kind: 'needs-consent'; reason: 'on-device-unavailable' }
  | { kind: 'needs-reshare'; reason: 'share-stopped' | 'no-audio-track' }
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
