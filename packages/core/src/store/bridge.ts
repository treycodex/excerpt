import type { Meeting, NotesDocument, NotesGenerationRequest, NotesProviderStatus, Preferences } from '@excerpt/types';

/**
 * The seam between the website and the macOS app.
 *
 * The notes editor is the same React app on both. In a browser it reads IndexedDB;
 * inside Excerpt's window it reads the Mac's own files, because the meetings were
 * written there by the native capture that the browser cannot do. The editor itself
 * knows about neither — it calls the same functions, and this decides where they go.
 *
 * The native session remains authoritative while capture is live. Settled transcript
 * events cross only as meeting snapshots for reading; captions stay native, where a
 * webview round trip would put them behind the words.
 */
export interface ExcerptBridge {
  listMeetings(): Promise<Meeting[]>;
  loadMeeting(id: string): Promise<Meeting | undefined>;
  /** Native capture may return its authoritative merged draft after a document edit. */
  saveMeeting(meeting: Meeting): Promise<Meeting | undefined>;
  deleteMeeting(id: string): Promise<void>;
  loadPreferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<void>;
  /** Hands the Markdown to a real save panel rather than a download the sandbox eats. */
  exportMarkdown(filename: string, markdown: string): Promise<void>;
  exportHTML?(filename: string, html: string): Promise<void>;
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
 * The host, if there is one. Absent in every browser, which is the point: the website
 * keeps working exactly as before without a single conditional in the views.
 */
export function bridge(): ExcerptBridge | undefined {
  return typeof globalThis !== 'undefined' ? globalThis.__excerptBridge : undefined;
}

export function hasBridge(): boolean {
  return bridge() !== undefined;
}

/**
 * Whether this is Excerpt's own window rather than a browser tab.
 *
 * Used only for what the interface says and offers, never for what it computes — the
 * notes are the notes on both. "Stored in this browser" is a true sentence on the
 * website and a false one on a Mac, and a product that gets that wrong is telling the
 * user it does not know where their data is.
 */
export function isNativeHost(): boolean {
  return hasBridge();
}
