import type { Meeting, MeetingImage, MeetingLibraryEntry, MeetingSearchResult, MeetingMutation, MeetingMutationAcknowledgment } from '@excerpt/types';
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
  const result = await mutateMeeting(mutation, meeting.images);
  if (result.status === 'conflict') throw new Error(result.message ?? 'The meeting changed before it could be saved.');
  return result.meeting;
}

export async function loadMeeting(id: string): Promise<Meeting | undefined> { return host().loadMeeting(id); }
export async function deleteMeeting(id: string): Promise<void> { await host().deleteMeeting(id); }
export async function renameMeeting(id: string, title: string): Promise<MeetingLibraryEntry> {
  return host().renameMeeting(id, title);
}
export async function mutateMeeting(
  mutation: MeetingMutation, knownImages: MeetingImage[] = [],
): Promise<MeetingMutationAcknowledgment> {
  const native = host();
  const result = await native.mutateMeeting(mutation);
  if (!result.imageDataOmitted) return result;
  const known = new Map(knownImages.map((image) => [image.id, image]));
  if ((result.meeting.images ?? []).every((image) => known.get(image.id)?.dataUrl)) {
    return {
      ...result,
      imageDataOmitted: false,
      meeting: {
        ...result.meeting,
        images: (result.meeting.images ?? []).map((image) => ({ ...image, dataUrl: known.get(image.id)!.dataUrl })),
      },
    };
  }
  // A native capture unknown to this editor must never become an empty image.
  const full = await native.loadMeeting(mutation.meetingId);
  if (!full || (full.revision ?? full.draftRevision ?? 0) < result.revision) {
    throw new Error('The saved meeting could not be reloaded with its images.');
  }
  return { ...result, imageDataOmitted: false, meeting: full };
}
export async function listMeetings(): Promise<MeetingLibraryEntry[]> { return host().listMeetings(); }
export async function searchMeetingLibrary(query: string): Promise<MeetingSearchResult[]> { return host().searchMeetings(query); }
export async function readMeetingLibrary(): Promise<{ meetings: MeetingLibraryEntry[]; available: boolean }> {
  try { return { meetings: await host().listMeetings(), available: true }; }
  catch { return { meetings: [], available: false }; }
}
