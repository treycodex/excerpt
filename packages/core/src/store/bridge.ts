import type {
  CaptionSettings, DesktopSettings, ExportOutcome, Meeting, MeetingLibraryEntry, MeetingSearchResult, MeetingMutation, MeetingMutationAcknowledgment,
  NotesDocument, NotesGenerationRequest, NotesProviderStatus, Preferences,
} from '@excerpt/types';

/**
 * The seam between the desktop editor and the macOS app. Meeting data belongs to
 * native storage; the editor has no browser persistence fallback.
 *
 * The native session remains authoritative while capture is live. Settled transcript
 * events cross only as meeting snapshots for reading; captions stay native, where a
 * webview round trip would put them behind the words.
 */
export interface ExcerptBridge {
  /** Starts native capture through the single application coordinator, optionally named. */
  startMeeting(title?: string): Promise<void>;
  /** Ends the meeting in progress and saves its transcript. */
  endMeeting?(): Promise<void>;
  /** Whether Excerpt offers to start when a call app takes the microphone. */
  setNoticeMeetings?(enabled: boolean): Promise<DesktopSettings>;
  /** Opens the native live editor for the active meeting, if one exists. */
  openLiveNotes(): Promise<void>;
  /** The current position on the active native meeting clock, in milliseconds. */
  getLiveMeetingTime(meetingId: string): Promise<number>;
  retryAutomaticNotes(meetingId: string): Promise<Meeting>;
  /** Reads native-owned caption, microphone, display, and shortcut state. */
  loadDesktopSettings(): Promise<DesktopSettings>;
  /** Replaces only native caption preferences; browser storage is never involved. */
  saveCaptionSettings(settings: Partial<Pick<CaptionSettings, 'preset' | 'size' | 'position' | 'enabled' | 'displayId'>>): Promise<DesktopSettings>;
  /** Selects a stable native capture-device identifier. */
  selectMicrophone(deviceId: string): Promise<DesktopSettings>;
  /** Chooses whether to import new macOS screenshots saved during a meeting. */
  setScreenshotImportEnabled(enabled: boolean): Promise<DesktopSettings>;
  listMeetings(): Promise<MeetingLibraryEntry[]>;
  /** Native searches persisted text without sending a whole library into the webview. */
  searchMeetings(query: string): Promise<MeetingSearchResult[]>;
  /** Changes only the title; returns a small durable library row. */
  renameMeeting(id: string, title: string): Promise<MeetingLibraryEntry>;
  loadMeeting(id: string): Promise<Meeting | undefined>;
  /** Resolves only after native storage durably acknowledges the typed operation. */
  mutateMeeting(mutation: MeetingMutation): Promise<MeetingMutationAcknowledgment>;
  deleteMeeting(id: string): Promise<void>;
  loadPreferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<void>;
  /** Hands the Markdown to a real save panel rather than a download the sandbox eats. */
  exportMarkdown(filename: string, markdown: string): Promise<ExportOutcome>;
  exportHTML?(filename: string, html: string): Promise<ExportOutcome>;
  summarizeNotes?(meeting: Meeting, request: NotesGenerationRequest): Promise<NotesDocument>;
  getNotesProviderStatus?(): Promise<NotesProviderStatus>;
  configureOpenAIKey?(): Promise<NotesProviderStatus>;
  removeOpenAIKey?(): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __excerptBridge: ExcerptBridge | undefined;
}

/**
 * The host, if there is one. When absent, the editor shows a desktop-host error.
 */
export function bridge(): ExcerptBridge | undefined {
  return typeof globalThis !== 'undefined' ? globalThis.__excerptBridge : undefined;
}

export function hasBridge(): boolean {
  return bridge() !== undefined;
}

/**
 * Whether this is Excerpt's own window rather than an unsupported browser tab.
 */
export function isNativeHost(): boolean {
  return hasBridge();
}
