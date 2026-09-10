/** Where preferences live in a browser. The scoring rules are in ../scoring. */
import { get, set } from 'idb-keyval';
import type { Preferences } from '@excerpt/types';
import { DEFAULT_PREFERENCES } from '../scoring';

const KEY = 'excerpt:preferences';

/** Falls back to defaults rather than hanging when storage is unavailable. */
export async function loadPreferences(): Promise<Preferences> {
  try {
    const stored = await get<Preferences>(KEY);
    return stored ? { ...DEFAULT_PREFERENCES, ...stored } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await set(KEY, prefs);
}
