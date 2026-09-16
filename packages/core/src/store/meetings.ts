import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Meeting, MeetingImage } from '@excerpt/types';
import type { ProcessingMode, TranscriptEvent } from '@excerpt/types';
import { bridge } from './bridge';

/**
 * Local meeting library. IndexedDB, on this device, and nowhere else — there is no
 * backend and no account, so this is the whole persistence story.
 */
const store = createStore('excerpt', 'meetings');

/**
 * Drafts live in their own database, not in a second store beside `meetings`.
 *
 * idb-keyval opens a database with no explicit version, so `createStore` can only
 * create its object store during the upgrade that first creates the database.
 * Two stores in one database therefore race: whichever is touched first on a
 * fresh profile creates `excerpt` at version 1 holding only itself, the other is
 * never created, and every transaction against it throws NotFoundError.
 *
 * Measured in Chrome: with the library read first — the normal order, since the
 * notes workspace wraps the capture route — `excerpt` held `meetings` alone and
 * every capture draft write failed. Because `saveCaptureDraft` was the one store
 * write without a guard, and both call sites discarded its rejection, the
 * recovery net this product promises had never once worked in a browser.
 */
const draftStore = createStore('excerpt-capture', 'capture');
const DRAFT_KEY = 'active';

/**
 * Read a draft from where drafts used to be written, for the profiles that won
 * the race the other way and do have an `excerpt.capture` store.
 *
 * Done by hand rather than through idb-keyval because the fix must not become
 * the bug: opening without a version is what created the race, so this opens,
 * looks, and reads only if the store is already there. It never upgrades and
 * never creates anything.
 */
async function legacyDraft(): Promise<CaptureDraft | undefined> {
  try {
    return await new Promise<CaptureDraft | undefined>((resolve) => {
      const request = indexedDB.open('excerpt');
      request.onupgradeneeded = () => { /* never create; this is a look, not a write */ };
      request.onerror = () => resolve(undefined);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('capture')) { db.close(); return resolve(undefined); }
        const read = db.transaction('capture', 'readonly').objectStore('capture').get(DRAFT_KEY);
        read.onsuccess = () => { db.close(); resolve(read.result as CaptureDraft | undefined); };
        read.onerror = () => { db.close(); resolve(undefined); };
      };
    });
  } catch { return undefined; }
}

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

/**
 * Finalised text only. Interim recognition remains volatile and is never recovered.
 *
 * Returns whether the draft reached the disk. This was the one store write without
 * a guard, and every caller swallowed its rejection, so a browser refusing to
 * persist — a private window, blocked site data, a full quota — produced a capture
 * with no recovery net and no hint that the net was gone. Failing quietly is the
 * one thing a safety mechanism may not do.
 */
export async function saveCaptureDraft(draft: CaptureDraft): Promise<boolean> {
  try { await set(DRAFT_KEY, draft, draftStore); return true; } catch { return false; }
}

export async function loadCaptureDraft(): Promise<CaptureDraft | undefined> {
  try {
    const draft = await get<CaptureDraft>(DRAFT_KEY, draftStore);
    if (draft) return draft;
  } catch { /* fall through to the old location */ }
  return legacyDraft();
}

export async function clearCaptureDraft(): Promise<void> {
  try { await del(DRAFT_KEY, draftStore); } catch { /* already absent */ }
  // A draft left in the old location would otherwise be offered again forever.
  try {
    const stale = await legacyDraft();
    if (stale) await del(DRAFT_KEY, createStore('excerpt', 'capture'));
  } catch { /* the old store is absent on almost every profile */ }
}
