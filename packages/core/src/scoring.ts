/**
 * Salience and personalisation — the deciding half of preferences, with no storage
 * in it. Split out so it can run anywhere the extraction engine runs: the macOS app
 * hosts this file's bundle in JavaScriptCore, where IndexedDB does not exist.
 */
import type { Category, Item, Preferences } from '@excerpt/types';

export const DEFAULT_PREFERENCES: Preferences = {
  order: ['decision', 'action', 'deadline', 'question'],
  boosts: [],
  instruction: '',
};

/** Words that carry no signal about what a person cares about in a meeting. */
const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'the', 'a', 'an', 'and',
  'or', 'but', 'if', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as',
  'is', 'are', 'was', 'be', 'been', 'that', 'this', 'these', 'those', 'what', 'which',
  'work', 'works', 'working', 'want', 'wants', 'need', 'needs', 'like', 'prioritise',
  'prioritize', 'priority', 'focus', 'care', 'about', 'anything', 'everything',
  'ignore', 'small', 'talk', 'please', 'also', 'especially', 'really', 'just',
  'meeting', 'meetings', 'notes', 'note', 'me.', 'am', 'do', 'don', 'not',
  'thing', 'things', 'stuff', 'get', 'got', 'make', 'made', 'take', 'taken',
  'keep', 'have', 'has', 'had', 'can', 'will', 'would', 'should', 'could',
]);

/**
 * Turn a free-text instruction into boost terms.
 *
 * This is the honest version of "personalisation". Excerpt cannot understand a
 * sentence without a language model, so it does not pretend to: it extracts the
 * terms it will actually weight and SHOWS them, editable. Transparent beats
 * magical, and it is the only version that is true.
 */
export function deriveBoosts(instruction: string): string[] {
  const words = instruction
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    // Order matters: an "es" rule applied first turns "deadlines" into "deadlin",
    // which no longer matches "deadline" and so keeps both.
    const stem =
      w.endsWith('ies') && w.length > 4 ? `${w.slice(0, -3)}y`
      : w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1)
      : w;
    if (seen.has(stem)) continue;
    seen.add(stem);
    out.push(w);
  }
  return out.slice(0, 12);
}

const CATEGORY_WEIGHT = 6;

/**
 * Salience decides ordering, never inclusion. Nothing is hidden because the user
 * did not ask for it — a decision they forgot to prioritise is still a decision.
 */
export function scoreItem(item: Item, prefs: Preferences): number {
  const rank = prefs.order.indexOf(item.category);
  let score = rank === -1 ? 0 : (prefs.order.length - rank) * CATEGORY_WEIGHT;

  const haystack = `${item.title} ${item.evidence.map((e) => e.quote).join(' ')}`.toLowerCase();
  for (const term of prefs.boosts) if (haystack.includes(term.toLowerCase())) score += 4;

  if (item.assignee === 'you') score += 5;          // things landing on you matter most
  if (item.state === 'decided') score += 3;
  if (item.due) score += 2;
  return score;
}

/** Which boost terms actually fired, so the UI can show its working. */
export function matchedBoosts(item: Item, prefs: Preferences): string[] {
  const haystack = `${item.title} ${item.evidence.map((e) => e.quote).join(' ')}`.toLowerCase();
  return prefs.boosts.filter((t) => haystack.includes(t.toLowerCase()));
}

export function applyPreferences(items: Item[], prefs: Preferences): Item[] {
  return items
    .map((i) => ({ ...i, salience: scoreItem(i, prefs) }))
    .sort((a, b) => b.salience - a.salience
      || (a.evidence[0]?.tArrived ?? 0) - (b.evidence[0]?.tArrived ?? 0));
}

export function orderCategories(prefs: Preferences): Category[] {
  const known = prefs.order.filter((c) => DEFAULT_PREFERENCES.order.includes(c));
  const missing = DEFAULT_PREFERENCES.order.filter((c) => !known.includes(c));
  return [...known, ...missing];
}
