export { splitIntoSubtitleLines, dashDialogue } from './caption/lines';
export { toTurns } from './transcript/turns';
export type { Turn } from './transcript/turns';
export { DemoTranscriptAdapter } from './capture/demo';
export type { ScriptedLine } from './capture/demo';
export { LiveCaptureAdapter, isStalled, sourceHealth } from './capture/live';
export type { LiveCaptureOptions, StreamDiagnostics, SourceHealth } from './capture/live';
export { listMicrophones, preferredMicrophone } from './capture/devices';
export type { AudioInput } from './capture/devices';
export { extractItems, classify, extractDecisions, toSentences, relateItems } from './extract';
export type { Sentence, ItemRelation, RelationKind } from './extract';
export {
  saveMeeting, loadMeeting, listMeetings, readMeetingLibrary, deleteMeeting,
  saveCaptureDraft, loadCaptureDraft, clearCaptureDraft,
} from './store/meetings';
export type { CaptureDraft } from './store/meetings';
export { searchMeetings, meetingNoteCount } from './store/search';
export type { MeetingMatch, MeetingMatchKind } from './store/search';
export { bridge, hasBridge, isNativeHost } from './store/bridge';
export type { ExcerptBridge } from './store/bridge';
export { toMarkdown, toHTML } from './export/markdown';
export { buildNotesDocument, preserveNoteEdits, refreshMeetingNotes, noteTitle, shapeNotice } from './notes/summary';
export {
  DEFAULT_PREFERENCES, applyPreferences, deriveBoosts, matchedBoosts, scoreItem,
  orderCategories,
} from './scoring';
export { loadPreferences, savePreferences } from './store/preferences';
export { notesCapability, mergeGeneratedNotes, compareNotesDocuments, notesMetadataDifference, boundTombstones } from './notes/generation';
export type { NotesCapability, NotesEnhancement } from './notes/generation';
export {
  editableDocument, insertMeetingImage, previewTranscriptCorrection, preserveDocument,
  safeImageUrl, meetingImageContext, reconcileMeetingImageContexts, meetingImagePassage,
  transcriptEventTime, MOMENT_CONTEXT_BEFORE, MOMENT_CONTEXT_AFTER,
} from './notes/editor';
