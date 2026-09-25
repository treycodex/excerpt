import type { Preferences } from '@excerpt/types';
import { bridge } from './bridge';
import { DEFAULT_PREFERENCES } from '../scoring';
import { NativeEditorHostError } from './meetings';

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
