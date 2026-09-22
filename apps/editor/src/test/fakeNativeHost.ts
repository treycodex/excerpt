import type { ExcerptBridge } from '@excerpt/core';
import type { CaptionSettings, DesktopSettings, Meeting, MeetingMutation, MeetingMutationAcknowledgment, Preferences } from '@excerpt/types';

/**
 * Development/test-only native host. Browser tests install it explicitly before
 * importing storage clients, so a passing editor test never depends on IndexedDB.
 * It is intentionally outside production imports; the desktop host is WKWebView.
 */
export interface FakeNativeHost extends ExcerptBridge {
  calls: string[];
  meetings: Map<string, Meeting>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createFakeNativeHost(input: { meetings?: Meeting[]; preferences?: Preferences } = {}): FakeNativeHost {
  const meetings: Map<string, Meeting> = new Map((input.meetings ?? []).map((meeting): [string, Meeting] => [meeting.id, clone({
    ...meeting, schemaVersion: meeting.schemaVersion ?? 1,
    revision: meeting.revision ?? meeting.draftRevision ?? 0,
    documentRevision: meeting.documentRevision ?? meeting.draftRevision ?? 0,
    sourceRevision: meeting.sourceRevision ?? 0,
  })]));
  const calls: string[] = [];
  let preferences = clone(input.preferences ?? {
    order: ['decision', 'action', 'deadline', 'question'], boosts: [], instruction: '', notesProvider: 'apple',
  }) as Preferences;
  let desktopSettings: DesktopSettings = {
    captions: {
      preset: 'classic', size: 'medium', position: 'standard', enabled: true,
      displayId: 'display-1', displayName: 'Built-in Display', displayMissing: false,
      displays: [{ id: 'display-1', name: 'Built-in Display', connected: true }], capturable: true,
    },
    microphone: {
      selectedDeviceId: 'mic-1', health: 'ready', message: 'Connected and ready.',
      devices: [{ id: 'mic-1', name: 'MacBook Microphone', connected: true }],
    },
    shortcuts: [
      { name: 'meeting', label: 'Start or end meeting', shortcut: '⌘⇧R', registered: true, relevant: true },
      { name: 'captions', label: 'Show or hide captions', shortcut: '⌘⇧C', registered: true, relevant: true },
      { name: 'catchUp', label: 'Catch up', shortcut: '⌘⇧J', registered: false, relevant: false },
      { name: 'capture', label: 'Capture moment', shortcut: '⌘⇧S', registered: false, relevant: false },
    ],
  };

  return {
    calls,
    meetings,
    async startMeeting() { calls.push('startMeeting'); },
    async openLiveNotes() { calls.push('openLiveNotes'); },
    async loadDesktopSettings() { calls.push('loadDesktopSettings'); return clone(desktopSettings); },
    async saveCaptionSettings(settings: Pick<CaptionSettings, 'preset' | 'size' | 'position' | 'enabled' | 'displayId'>) {
      calls.push('saveCaptionSettings');
      desktopSettings = { ...desktopSettings, captions: { ...desktopSettings.captions, ...clone(settings) } };
      return clone(desktopSettings);
    },
    async selectMicrophone(deviceId) {
      calls.push(`selectMicrophone:${deviceId}`);
      desktopSettings = { ...desktopSettings, microphone: { ...desktopSettings.microphone, selectedDeviceId: deviceId } };
      return clone(desktopSettings);
    },
    async listMeetings() { calls.push('listMeetings'); return [...meetings.values()].map(clone); },
    async loadMeeting(id) { calls.push(`loadMeeting:${id}`); return meetings.has(id) ? clone(meetings.get(id)!) : undefined; },
    async mutateMeeting(mutation) {
      calls.push(`mutateMeeting:${mutation.meetingId}`);
      const result = applyMutation(meetings.get(mutation.meetingId), mutation);
      if (result.status !== 'conflict') meetings.set(mutation.meetingId, clone(result.meeting));
      return clone(result);
    },
    async deleteMeeting(id) { calls.push(`deleteMeeting:${id}`); meetings.delete(id); },
    async loadPreferences() { calls.push('loadPreferences'); return clone(preferences); },
    async savePreferences(next) { calls.push('savePreferences'); preferences = clone(next); },
    async exportMarkdown() { calls.push('exportMarkdown'); return 'saved'; },
  };
}

function applyMutation(current: Meeting | undefined, mutation: MeetingMutation): MeetingMutationAcknowledgment {
  const creation = mutation.changes.find((change) => change.type === 'create');
  let meeting = clone(current ?? (creation?.type === 'create' ? creation.meeting : undefined)!);
  if (!meeting) throw new Error('Meeting missing');
  const currentDocumentRevision = meeting.documentRevision ?? meeting.draftRevision ?? 0;
  const currentSourceRevision = meeting.sourceRevision ?? 0;
  const conflict = mutation.changes.some((change) => (
    (change.type === 'setDocument' || change.type === 'correctTranscript')
      && mutation.baseDocumentRevision !== currentDocumentRevision
  ) || (
    (change.type === 'setReviewItems' || change.type === 'correctTranscript')
      && mutation.baseSourceRevision !== currentSourceRevision
  ));
  if (conflict) return acknowledgment(mutation, meeting, 'conflict');
  let changedDocument = false;
  for (const change of mutation.changes) {
    if (change.type === 'create') meeting = clone(change.meeting);
    if (change.type === 'setTitle') meeting.title = change.title;
    if (change.type === 'setDocument') {
      if (change.document) meeting.notes = change.document; else delete meeting.notes;
      if (change.suggestedNotes) meeting.suggestedNotes = change.suggestedNotes; else delete meeting.suggestedNotes;
      changedDocument = true;
    }
    if (change.type === 'setReviewItems') meeting.items = clone(change.items);
    if (change.type === 'correctTranscript') {
      meeting.events = clone(change.events); meeting.items = clone(change.items);
      if (change.document) meeting.notes = change.document; else delete meeting.notes;
      if (change.suggestedNotes) meeting.suggestedNotes = change.suggestedNotes; else delete meeting.suggestedNotes;
      meeting.images = clone(change.images); meeting.sourceRevision = change.sourceRevision; changedDocument = true;
    }
    if (change.type === 'addImages') {
      const known = new Set((meeting.images ?? []).map((image) => image.id));
      meeting.images = [...(meeting.images ?? []), ...change.images.filter((image) => !known.has(image.id))];
      const blocks = meeting.notes?.blocks ?? [];
      const knownBlocks = new Set(blocks.map((block) => block.id));
      meeting.notes = { ...(meeting.notes ?? { version: 1, method: 'extractive', keyPoints: [], topics: [] }), blocks: [...blocks, ...change.blocks.filter((block) => !knownBlocks.has(block.id))] };
      changedDocument = true;
    }
    if (change.type === 'updateImage') {
      meeting.images = (meeting.images ?? []).map((image) => image.id === change.imageId
        ? { ...image, caption: change.caption, ...(change.needsReview === undefined ? {} : { needsReview: change.needsReview }) }
        : image);
      if (meeting.notes?.blocks) meeting.notes = { ...meeting.notes, blocks: meeting.notes.blocks.map((block) => block.imageId === change.imageId ? { ...block, text: change.blockText, userEdited: true } : block) };
      changedDocument = true;
    }
  }
  const wasCreation = !current;
  meeting.schemaVersion = 1;
  meeting.revision = wasCreation ? Math.max(1, meeting.revision ?? 0) : (current!.revision ?? 0) + 1;
  meeting.documentRevision = wasCreation ? (meeting.documentRevision ?? 0) : currentDocumentRevision + (changedDocument ? 1 : 0);
  meeting.sourceRevision ??= 0;
  return acknowledgment(mutation, meeting, mutation.baseRevision === (current?.revision ?? 0) ? 'applied' : 'rebased');
}

function acknowledgment(mutation: MeetingMutation, meeting: Meeting, status: MeetingMutationAcknowledgment['status']): MeetingMutationAcknowledgment {
  return {
    operationId: mutation.operationId, meetingId: mutation.meetingId, status,
    revision: meeting.revision ?? 0,
    documentRevision: meeting.documentRevision ?? 0,
    sourceRevision: meeting.sourceRevision ?? 0,
    meeting: clone(meeting),
  };
}

/** Installs a fake only for the scope of one test and restores any prior host. */
export function installFakeNativeHost(host: FakeNativeHost): () => void {
  const scope = globalThis as typeof globalThis & { __excerptBridge?: ExcerptBridge };
  const previous = scope.__excerptBridge;
  scope.__excerptBridge = host;
  return () => {
    if (previous) scope.__excerptBridge = previous;
    else delete scope.__excerptBridge;
  };
}
