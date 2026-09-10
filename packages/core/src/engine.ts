/**
 * The engine, with no browser in it.
 *
 * Everything trust-critical — what counts as a decision, what may be called an
 * action, how a sentence is split for a subtitle, how items are ordered — lives
 * here and is compiled once into `excerpt-engine.js`. The website imports it as
 * TypeScript; the macOS app runs the same bundle inside JavaScriptCore. One
 * implementation, two runtimes, one set of fixtures.
 *
 * Nothing in this file or its imports may touch `window`, `document`, IndexedDB or
 * `fetch`. Capture, storage and rendering are the host's job on both platforms.
 */
import type { Item, Preferences, TranscriptEvent } from '@excerpt/types';
import { extractItems } from './extract';
import { splitIntoSubtitleLines, dashDialogue } from './caption/lines';
import { applyPreferences, deriveBoosts, orderCategories, matchedBoosts, DEFAULT_PREFERENCES } from './scoring';
import { toMarkdown } from './export/markdown';

/**
 * The host talks JSON, not JavaScript objects.
 *
 * JavaScriptCore can pass structured values, but every one of them is a bridging
 * surface that can disagree with the TypeScript type in ways nothing checks. A JSON
 * string is one surface, and the same one the webview already uses.
 */
export interface EngineAPI {
  /** Version of the engine contract, so a stale bundle is visible rather than subtle. */
  version: string;
  extract(eventsJSON: string, referenceISO?: string): string;
  rank(itemsJSON: string, preferencesJSON: string): string;
  boostsFor(instruction: string): string;
  subtitleLines(text: string, maxChars?: number): string;
  markdown(meetingJSON: string): string;
  defaultPreferences(): string;
}

export const ENGINE_VERSION = '1';

function parse<T>(json: string, fallback: T): T {
  try {
    const value = JSON.parse(json);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export const engine: EngineAPI = {
  version: ENGINE_VERSION,

  extract(eventsJSON, referenceISO) {
    const events = parse<TranscriptEvent[]>(eventsJSON, []);
    // The reference date decides what "Thursday" means. The host passes the
    // meeting's own start, so re-extracting an old meeting cannot silently
    // reinterpret its deadlines against today.
    const reference = referenceISO ? new Date(referenceISO) : new Date();
    return JSON.stringify(extractItems(events, Number.isNaN(reference.getTime()) ? new Date() : reference));
  },

  rank(itemsJSON, preferencesJSON) {
    const items = parse<Item[]>(itemsJSON, []);
    const prefs = { ...DEFAULT_PREFERENCES, ...parse<Partial<Preferences>>(preferencesJSON, {}) };
    const ranked = applyPreferences(items, prefs);
    return JSON.stringify(
      ranked.map((item) => ({ ...item, matched: matchedBoosts(item, prefs) })),
    );
  },

  boostsFor(instruction) {
    return JSON.stringify(deriveBoosts(instruction ?? ''));
  },

  subtitleLines(text, maxChars) {
    // No dash convention here: dashes mark two speakers sharing one caption window,
    // and the overlay shows one speaker at a time. Applying it to every wrapped line
    // would put a dialogue dash in front of half of one person's sentence.
    return JSON.stringify(splitIntoSubtitleLines(text ?? '', maxChars ? { maxChars } : {}));
  },

  markdown(meetingJSON) {
    const meeting = parse<Parameters<typeof toMarkdown>[0] | null>(meetingJSON, null);
    return meeting ? toMarkdown(meeting) : '';
  },

  defaultPreferences() {
    return JSON.stringify(DEFAULT_PREFERENCES);
  },
};

export { extractItems, splitIntoSubtitleLines, dashDialogue, applyPreferences, deriveBoosts, orderCategories };
