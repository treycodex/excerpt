/** Who produced the audio. This says who SPOKE — never who was addressed. */
export type SourceRole = 'you' | 'remote';

export type Category  = 'decision' | 'action' | 'deadline' | 'question';
export type ItemState = 'discussed' | 'proposed' | 'decided';

/** Assignment is deliberately coarse. See the assignment rules in packages/core. */
export type Assignee = 'you' | 'unassigned';

/** Where transcription actually happened. Surfaced to the user, never hidden. */
export type ProcessingMode = 'on-device' | 'cloud' | 'demo';
export type MeetingFinishReason = 'stopped' | 'interrupted' | 'recovered';

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
  /**
   * Item ids the reader has said this is NOT the same thing as.
   *
   * Its own field rather than a reuse of `userEdited`, which was doing this job
   * and claiming far more than the reader meant: an item marked edited is treated
   * as hand-corrected everywhere, including by `refreshMeetingNotes`, which then
   * protects it from being replaced by a fresh extraction. Declining a suggestion
   * is not an edit.
   */
  unrelated?: string[];
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
  method: 'extractive' | 'on-device' | 'cloud';
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
  /** Removed blocks retained only to prevent regeneration from restoring them. */
  deletedBlocks?: NoteBlock[];
  /** How this wording was produced. Kept separate from transcription provenance. */
  generation?: NotesGeneration;
}

/** The library's small native projection; image bytes and transcript text stay on disk. */
export interface MeetingLibraryEntry {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  processing: ProcessingMode;
  draftRevision?: number;
  noteCount: number;
  decidedCount: number;
  mineCount: number;
}

export interface MeetingSearchResult {
  meeting: MeetingLibraryEntry;
  kind: 'title' | 'note' | 'moment' | 'transcript';
  snippet: string;
  /** UTF-16 offsets into snippet, for JavaScript's slice(). */
  offset: number;
  length: number;
  eventId?: string;
}

export interface NotesGeneration {
  provider: 'apple' | 'openai';
  model: string;
  generatedAt: string;
  sourceRevision: number;
  style: 'balanced' | 'shorter' | 'detailed';
}

export interface NotesGenerationRequest {
  style: 'balanced' | 'shorter' | 'detailed';
}

/**
 * What the host can be asked to do right now, read without making a request.
 *
 * Every field past the first is optional so that an older app build, which reports
 * only the stored-key flag, still parses — and so that the web side treats "did not
 * say" as "not proven ready" rather than as a working provider.
 */
export interface NotesProviderStatus {
  openAIKeyConfigured: boolean;
  /** The provider the user has chosen, not the one that happens to be compiled in. */
  selected?: 'apple' | 'openai';
  /** Whether that provider can be asked now. Determined without a paid request. */
  ready?: boolean;
  reason?: 'no-key' | 'model-unavailable' | 'model-not-ready' | 'not-configured';
  /** Shown to the reader, so it must name the actual provider. */
  providerName?: string;
  /** Where the rewriting happens. Never assumed to be the Mac. */
  processing?: 'on-device' | 'cloud';
}

export interface MeetingImage {
  id: string;
  dataUrl: string;
  capturedAt: string;
  /** Original capture time on the meeting clock; independent of document position. */
  at: number;
  /** User-corrected meeting-time anchor; original capture time remains in `at`. */
  anchorAt?: number;
  /** False for a finished-meeting import whose meeting time is unknown. */
  timeKnown?: boolean;
  caption: string;
  /** How the image entered the meeting. Missing means a legacy capture. */
  origin?: 'excerpt' | 'system-screenshot' | 'paste' | 'drop' | 'import';
  /**
   * Stable source anchors around the capture. The window begins 20 seconds before
   * and ends 15 seconds after; event ids are reconciled as final speech arrives.
   */
  context?: MeetingImageContext;
  /** Nearby transcript wording changed after capture; the image itself is untouched. */
  needsReview?: boolean;
}

export interface MeetingImageContext {
  eventIds: string[];
  startAt: number;
  endAt: number;
}

export interface NoteBlock {
  id: string;
  kind: 'paragraph' | 'heading' | 'bullet' | 'image';
  text: string;
  evidence: Evidence[];
  at?: number;
  imageId?: string;
  /** Automatic image blocks may be recomposed; a moved image stays where the reader put it. */
  placement?: 'automatic' | 'manual';
  userEdited?: boolean;
  needsReview?: boolean;
  indent?: number;
}

export interface Preferences {
  order: Category[];
  boosts: string[];
  instruction: string;
  transcriptionChoice?: 'on-device-only' | 'cloud-allowed';
  /** Optional note wording provider. Transcription remains independent. */
  notesProvider?: 'apple' | 'openai';
}

export type CaptionPreset = 'classic' | 'warm' | 'contrast';
export type CaptionSize = 'small' | 'medium' | 'large';
export type CaptionPosition = 'lower' | 'standard' | 'higher';

export interface CaptionDisplay {
  id: string;
  name: string;
  connected: boolean;
}

/** Native-owned caption preferences. The editor only renders and submits these. */
export interface CaptionSettings {
  preset: CaptionPreset;
  size: CaptionSize;
  position: CaptionPosition;
  enabled: boolean;
  displayId: string;
  displays: CaptionDisplay[];
  displayMissing: boolean;
  displayName: string;
  capturable: true;
}

export type MicrophoneHealth =
  | 'ready' | 'starting' | 'hearing' | 'silent' | 'stalled' | 'failed' | 'missing';

export interface MicrophoneDevice {
  id: string;
  name: string;
  connected: boolean;
}

export interface MicrophoneSettings {
  selectionLocked: boolean;
  selectedDeviceId: string;
  devices: MicrophoneDevice[];
  health: MicrophoneHealth;
  message: string;
}

export type MeetingShortcutName = 'meeting' | 'captions' | 'catchUp' | 'capture';

export interface MeetingShortcutStatus {
  name: MeetingShortcutName;
  label: string;
  shortcut: string;
  registered: boolean;
  relevant: boolean;
}

export interface DesktopSettings {
  captions: CaptionSettings;
  microphone: MicrophoneSettings;
  shortcuts: MeetingShortcutStatus[];
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
  /** Native live drafts increment this only when their title or document changes. */
  draftRevision?: number;
  /** Finished enhancement waits here for review; it never overwrites the document. */
  suggestedNotes?: NotesDocument;
  /** Advances only when source transcript wording changes. */
  sourceRevision?: number;
  /** Persisted schema for native-owned meeting files. Missing means legacy schema 0. */
  schemaVersion?: number;
  /** Native-owned revision for every durable change, including live capture updates. */
  revision?: number;
  /** Advances only when the editable document changes. */
  documentRevision?: number;
  /** Bounded durable idempotency keys for editor mutations. */
  appliedOperationIds?: string[];
  /** Native enhancement lifecycle; absent on legacy meetings. */
  generationStatus?: NotesGenerationStatus;
  /** Durable reason native capture ended; absent on legacy meetings. */
  finishReason?: MeetingFinishReason;
  /** Native capture failure associated with an interrupted finish. */
  captureError?: string;
}

export interface NotesGenerationStatus {
  state: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled';
  generationId: string;
  sourceRevision: number;
  /** Fingerprint of transcript and captured-moment captions supplied to the job. */
  inputFingerprint?: string;
  message?: string;
}

/**
 * Explicit editor-owned changes. Native capture and storage retain ownership of all
 * fields not named by one of these operations.
 */
export type MeetingChange =
  | { type: 'create'; meeting: Meeting }
  | { type: 'setTitle'; title: string }
  | { type: 'setDocument'; document: NotesDocument | null; suggestedNotes: NotesDocument | null }
  | { type: 'setReviewItems'; items: Item[] }
  | {
      type: 'correctTranscript';
      events: TranscriptEvent[];
      items: Item[];
      document: NotesDocument | null;
      suggestedNotes: NotesDocument | null;
      images: MeetingImage[];
      sourceRevision: number;
    }
  | { type: 'addImages'; images: MeetingImage[]; blocks: NoteBlock[] }
  | { type: 'updateImage'; imageId: string; caption: string; needsReview?: boolean;
      anchorAt?: number; timeKnown?: boolean; blockText: string };

export interface MeetingMutation {
  operationId: string;
  meetingId: string;
  baseRevision: number;
  baseDocumentRevision: number;
  baseSourceRevision: number;
  changes: MeetingChange[];
}

export interface MeetingMutationAcknowledgment {
  operationId: string;
  meetingId: string;
  status: 'applied' | 'rebased' | 'duplicate' | 'conflict';
  revision: number;
  documentRevision: number;
  sourceRevision: number;
  meeting: Meeting;
  message?: string;
  /** Native may omit unchanged image bytes from an applied acknowledgment. */
  imageDataOmitted?: boolean;
}

export type ExportOutcome = 'saved' | 'cancelled';

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
