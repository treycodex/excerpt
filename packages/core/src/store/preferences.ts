/** Where preferences live in a browser. The scoring rules are in ../scoring. */
import { get, set } from 'idb-keyval';
import type { Preferences } from '@excerpt/types';
import { DEFAULT_PREFERENCES } from '../scoring';
import { bridge } from './bridge';

const KEY = 'excerpt:preferences';

/** Falls back to defaults rather than hanging when storage is unavailable. */
export async function loadPreferences(): Promise<Preferences> {
  const host = bridge();
  if (host) {
    try { return { ...DEFAULT_PREFERENCES, ...(await host.loadPreferences()) }; }
    catch { return DEFAULT_PREFERENCES; }
  }
  try {
    const stored = await get<Preferences>(KEY);
    return stored ? { ...DEFAULT_PREFERENCES, ...stored } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  const host = bridge();
  if (host) return host.savePreferences(prefs);
  await set(KEY, prefs);
}
