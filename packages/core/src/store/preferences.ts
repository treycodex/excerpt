import type { Preferences } from '@excerpt/types';
import { bridge } from './bridge';
import { NativeEditorHostError } from './meetings';

export const DEFAULT_PREFERENCES: Preferences = { notesProvider: 'apple' };

export async function loadPreferences(): Promise<Preferences> {
  const host = bridge();
  if (!host) throw new NativeEditorHostError();
  return { ...DEFAULT_PREFERENCES, ...(await host.loadPreferences()) };
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  const host = bridge();
  if (!host) throw new NativeEditorHostError();
  await host.savePreferences(preferences);
}
