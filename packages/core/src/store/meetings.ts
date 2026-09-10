import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Meeting } from '@excerpt/types';

/**
 * Local meeting library. IndexedDB, on this device, and nowhere else — there is no
 * backend and no account, so this is the whole persistence story.
 */
const store = createStore('excerpt', 'meetings');

/**
 * IndexedDB is not always there: private windows, blocked site data, a browser
 * with storage disabled. A rejected read used to leave the UI on "Reading..."
 * forever, so every read degrades to an empty result instead.
 */
export async function saveMeeting(m: Meeting): Promise<void> {
  await set(m.id, m, store);
}

export async function loadMeeting(id: string): Promise<Meeting | undefined> {
  try { return await get<Meeting>(id, store); } catch { return undefined; }
}

export async function deleteMeeting(id: string): Promise<void> {
  try { await del(id, store); } catch { /* nothing to remove */ }
}

/** Newest first. Meetings are few, so reading them all is fine. */
export async function listMeetings(): Promise<Meeting[]> {
  try {
    const ids = await keys(store);
    const all = await Promise.all(ids.map((k) => get<Meeting>(k as string, store)));
    return all
      .filter((m): m is Meeting => !!m)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch {
    return [];
  }
}
