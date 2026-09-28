export { splitIntoSubtitleLines, dashDialogue } from './caption/lines';
export { toTurns } from './transcript/turns';
export { transcriptTimeline } from './transcript/timeline';
export type { Turn } from './transcript/turns';
export { healthOf, sourceConcern } from './capture/health';
export type { SourceHealth, SourceSignals } from './capture/health';
export { extractItems, classify, extractDecisions, toSentences } from './extract';
export type { Sentence } from './extract';
export {
  saveMeeting, loadMeeting, listMeetings, readMeetingLibrary, searchMeetingLibrary, deleteMeeting, renameMeeting, mutateMeeting,
  NativeEditorHostError,
} from './store/meetings';
export { searchMeetings, meetingNoteCount, meetingLibraryEntry } from './store/search';
export type { MeetingMatch, MeetingMatchKind } from './store/search';
export { bridge, hasBridge, isNativeHost } from './store/bridge';
export type { ExcerptBridge } from './store/bridge';
export {
  meetingMutation, reconcileMeetingUpdate, acceptsAcknowledgment, preserveGeneratedConflict,
} from './store/meeting-sync';
export { toMarkdown, toHTML } from './export/markdown';
export { buildNotesDocument, preserveNoteEdits, refreshMeetingNotes, shapeNotice, suggestMeetingTitle } from './notes/summary';
export { composeVisualNotes } from './notes/visual';
export { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './store/preferences';
export { notesCapability, mergeGeneratedNotes, compareNotesDocuments, notesMetadataDifference, boundTombstones } from './notes/generation';
export type { NotesCapability, NotesEnhancement } from './notes/generation';
export {
  editableDocument, hasSmartNotes, insertMeetingImage, previewTranscriptCorrection, preserveDocument,
  safeImageUrl, meetingImageContext, reconcileMeetingImageContexts, meetingImagePassage,
  transcriptEventTime, meetingImageTime, MOMENT_CONTEXT_BEFORE, MOMENT_CONTEXT_AFTER,
} from './notes/editor';
