/**
 * Caption looks. Three, deliberately — cinema has a house style, not a settings panel.
 * The values live in tokens.css so the Mac app reads the same definitions.
 */
export type CaptionPreset = 'classic' | 'warm' | 'contrast';

export const CAPTION_PRESETS: { id: CaptionPreset; name: string; note: string }[] = [
  { id: 'classic', name: 'Classic', note: 'White, no box. The film subtitle.' },
  { id: 'warm', name: 'Warm', note: 'Amber with a thin outline. Survives bright rooms.' },
  { id: 'contrast', name: 'High contrast', note: 'On a dark plate. Easiest to read.' },
];

const KEY = 'excerpt:caption-preset';

export function currentPreset(): CaptionPreset {
  try {
    const stored = localStorage.getItem(KEY) as CaptionPreset | null;
    if (stored && CAPTION_PRESETS.some((p) => p.id === stored)) return stored;
  } catch { /* storage unavailable; the default is fine */ }
  return 'classic';
}

/**
 * Applies to every document that shows captions. The picture-in-picture window is a
 * separate document, so it needs the attribute set on it directly — it inherits
 * nothing from the page that opened it.
 */
export function applyPreset(preset: CaptionPreset, ...also: (Document | null | undefined)[]): void {
  for (const doc of [document, ...also]) {
    if (doc) doc.documentElement.dataset.caption = preset;
  }
  try { localStorage.setItem(KEY, preset); } catch { /* a look is not data loss */ }
}

/** Called once at startup so the choice survives a reload. */
export function restorePreset(): CaptionPreset {
  const preset = currentPreset();
  document.documentElement.dataset.caption = preset;
  return preset;
}
