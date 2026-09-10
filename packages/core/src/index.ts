export { splitIntoSubtitleLines, dashDialogue } from './caption/lines';
export { toTurns } from './transcript/turns';
export type { Turn } from './transcript/turns';
export { DemoTranscriptAdapter } from './capture/demo';
export type { ScriptedLine } from './capture/demo';
export { LiveCaptureAdapter } from './capture/live';
export type { LiveCaptureOptions, StreamDiagnostics } from './capture/live';
export { listMicrophones, preferredMicrophone } from './capture/devices';
export type { AudioInput } from './capture/devices';
export { extractItems, classify, extractDecisions, toSentences } from './extract';
export type { Sentence } from './extract';
export {
  saveMeeting, loadMeeting, listMeetings, readMeetingLibrary, deleteMeeting,
  saveCaptureDraft, loadCaptureDraft, clearCaptureDraft,
} from './store/meetings';
export type { CaptureDraft } from './store/meetings';
export { bridge, hasBridge, isNativeHost } from './store/bridge';
export type { ExcerptBridge } from './store/bridge';
export { toMarkdown } from './export/markdown';
export {
  DEFAULT_PREFERENCES, applyPreferences, deriveBoosts, matchedBoosts, scoreItem,
  orderCategories,
} from './scoring';
export { loadPreferences, savePreferences } from './store/preferences';
