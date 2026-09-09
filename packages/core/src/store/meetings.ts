import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Meeting } from '@excerpt/types';

/**
 * Local meeting library. IndexedDB, on this device, and nowhere else — there is no
 * backend and no account, so this is the whole persistence story.
 */
const store = createStore('excerpt', 'meetings');

export async function saveMeeting(m: Meeting): Promise<void> {
  await set(m.id, m, store);
}

export async function loadMeeting(id: string): Promise<Meeting | undefined> {
  return get<Meeting>(id, store);
}

export async function deleteMeeting(id: string): Promise<void> {
  await del(id, store);
}

/** Newest first. Meetings are few, so reading them all is fine. */
export async function listMeetings(): Promise<Meeting[]> {
  const ids = await keys(store);
  const all = await Promise.all(ids.map((k) => get<Meeting>(k as string, store)));
  return all
    .filter((m): m is Meeting => !!m)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
