import type { Meeting, MeetingLibraryEntry, MeetingSearchResult, MeetingMutation, MeetingMutationAcknowledgment } from '@excerpt/types';
import { bridge } from './bridge';
import { meetingMutation } from './meeting-sync';

export class NativeEditorHostError extends Error {
  constructor() { super('Open this editor from Excerpt for Mac. Browser storage and browser capture are not part of the desktop product.'); }
}

function host() {
  const value = bridge();
  if (!value) throw new NativeEditorHostError();
  return value;
}

/** Compatibility convenience for retained document controls; it still emits a typed mutation. */
export async function saveMeeting(meeting: Meeting): Promise<Meeting | undefined> {
  const native = host();
  const current = await native.loadMeeting(meeting.id);
  const mutation = meetingMutation(current, meeting);
  if (!mutation) return current;
  const result = await native.mutateMeeting(mutation);
  if (result.status === 'conflict') throw new Error(result.message ?? 'The meeting changed before it could be saved.');
  return result.meeting;
}

export async function loadMeeting(id: string): Promise<Meeting | undefined> { return host().loadMeeting(id); }
export async function deleteMeeting(id: string): Promise<void> { await host().deleteMeeting(id); }
export async function mutateMeeting(mutation: MeetingMutation): Promise<MeetingMutationAcknowledgment> { return host().mutateMeeting(mutation); }
export async function listMeetings(): Promise<MeetingLibraryEntry[]> { return host().listMeetings(); }
export async function searchMeetingLibrary(query: string): Promise<MeetingSearchResult[]> { return host().searchMeetings(query); }
export async function readMeetingLibrary(): Promise<{ meetings: MeetingLibraryEntry[]; available: boolean }> {
  try { return { meetings: await host().listMeetings(), available: true }; }
  catch { return { meetings: [], available: false }; }
}
