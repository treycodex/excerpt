import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Meeting, MeetingImage } from '@excerpt/types';
import type { ProcessingMode, TranscriptEvent } from '@excerpt/types';
import { bridge } from './bridge';

/**
 * Local meeting library. IndexedDB, on this device, and nowhere else — there is no
 * backend and no account, so this is the whole persistence story.
 */
const store = createStore('excerpt', 'meetings');
const draftStore = createStore('excerpt', 'capture');
const DRAFT_KEY = 'active';

export interface CaptureDraft {
  id: string;
  startedAt: string;
  elapsed: number;
  processing: ProcessingMode;
  events: TranscriptEvent[];
  images?: MeetingImage[];
}

/**
 * IndexedDB is not always there: private windows, blocked site data, a browser
 * with storage disabled. A rejected read used to leave the UI on "Reading..."
 * forever, so every read degrades to an empty result instead.
 */
export async function saveMeeting(m: Meeting): Promise<Meeting | undefined> {
  const host = bridge();
  if (host) return host.saveMeeting(m);
  await set(m.id, m, store);
  return undefined;
}

export async function loadMeeting(id: string): Promise<Meeting | undefined> {
  const host = bridge();
  if (host) { try { return await host.loadMeeting(id); } catch { return undefined; } }
  try { return await get<Meeting>(id, store); } catch { return undefined; }
}

export async function deleteMeeting(id: string): Promise<void> {
  const host = bridge();
  if (host) { try { await host.deleteMeeting(id); } catch { /* nothing to remove */ } return; }
  try { await del(id, store); } catch { /* nothing to remove */ }
}

/** Newest first. Meetings are few, so reading them all is fine. */
export async function listMeetings(): Promise<Meeting[]> {
  return (await readMeetingLibrary()).meetings;
}

export async function readMeetingLibrary(): Promise<{ meetings: Meeting[]; available: boolean }> {
  const host = bridge();
  if (host) {
    // The Mac always has a folder. "Unavailable" there would mean a broken app, not
    // a browser refusing storage, so it is an error to report rather than degrade to.
    try { return { meetings: await host.listMeetings(), available: true }; }
    catch { return { meetings: [], available: false }; }
  }
  try {
    const ids = await keys(store);
    const all = await Promise.all(ids.map((k) => get<Meeting>(k as string, store)));
    return { meetings: all
      .filter((m): m is Meeting => !!m)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)), available: true };
  } catch {
    return { meetings: [], available: false };
  }
}

/** Finalised text only. Interim recognition remains volatile and is never recovered. */
export async function saveCaptureDraft(draft: CaptureDraft): Promise<void> {
  await set(DRAFT_KEY, draft, draftStore);
}

export async function loadCaptureDraft(): Promise<CaptureDraft | undefined> {
  try { return await get<CaptureDraft>(DRAFT_KEY, draftStore); } catch { return undefined; }
}

export async function clearCaptureDraft(): Promise<void> {
  try { await del(DRAFT_KEY, draftStore); } catch { /* already absent */ }
}
