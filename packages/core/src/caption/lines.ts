/**
 * Subtitle line-breaking — Motif 1.
 *
 * Film subtitles break on phrase boundaries, not on width. Breaking mid-phrase is
 * the single most common way conferencing captions look cheap, so this scores every
 * candidate split and picks the most phrase-like one rather than the first that fits.
 *
 * Proven in the Day 0 spike, where it rendered two-speaker dialogue correctly in a
 * Document PiP window.
 */

const BREAK_AFTER = /[.,;:!?—–]$/;

/** Words a line should begin with rather than end before. */
const WEAK_BEFORE = new Set([
  'and', 'but', 'or', 'so', 'because', 'if', 'when', 'while', 'that', 'which',
  'who', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as',
  'than', 'then',
]);

/**
 * Words that bind forward to the next word. Breaking after one of these strands a
 * determiner or premodifier at the end of a line ("...but the / client feels...",
 * "October next / week"), which is the classic cheap-caption look.
 */
const BIND_AFTER = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'my', 'your', 'our', 'their', 'its', 'his', 'her',
  'next', 'last', 'first', 'second', 'third', 'final',
  'every', 'each', 'some', 'any', 'no', 'more', 'most',
  'very', 'quite', 'one', 'two', 'three',
]);

export interface LineOptions {
  /** Characters per line. Matches --cap-max-chars. */
  maxChars?: number;
}

/**
 * Returns at most two lines. Longer text keeps its TAIL, because that is what a
 * viewer is currently reading — dropping the head is less disorienting than
 * dropping the words being spoken now.
 */
/** Best two-line split of `words`, or null when no split fits the budget. */
function bestSplit(words: string[], maxChars: number): [string, string] | null {
  let best: { score: number; lines: [string, string] } | null = null;

  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (a.length > maxChars || b.length > maxChars) continue;

    const prev = words[i - 1] ?? '';
    const next = (words[i] ?? '').toLowerCase().replace(/[^a-z']/g, '');

    const prevBare = prev.toLowerCase().replace(/[^a-z']/g, '');

    let score = Math.abs(a.length - b.length);   // prefer balanced lines
    if (BREAK_AFTER.test(prev)) score -= 28;     // strong boundary: punctuation
    else if (WEAK_BEFORE.has(next)) score -= 14; // weak boundary: conjunction
    else score += 6;                             // mid-phrase: penalise

    // Never strand a determiner or premodifier at line end.
    if (BIND_AFTER.has(prevBare)) score += 24;

    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best?.lines ?? null;
}

/**
 * Returns at most two lines. Longer text keeps its TAIL, because that is what a
 * viewer is currently reading — dropping the head is less disorienting than
 * dropping the words being spoken now.
 *
 * Trimming is iterative on purpose: an earlier recursive version could compute a
 * tail identical to its input and recurse until the stack blew.
 */
export function splitIntoSubtitleLines(text: string, { maxChars = 42 }: LineOptions = {}): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const words = clean.split(' ');
  const split = bestSplit(words, maxChars);
  if (split) return split;

  // Nothing fits in two lines. Drop words from the front until something does,
  // which always terminates because the window shrinks by one word each pass.
  for (let start = 1; start < words.length; start++) {
    const tail = words.slice(start);
    const joined = tail.join(' ');
    if (joined.length <= maxChars) return [joined];
    const tailSplit = bestSplit(tail, maxChars);
    if (tailSplit) return tailSplit;
  }

  // A single word longer than the budget. Hard-slice rather than loop.
  const last = words[words.length - 1] ?? '';
  return [last.slice(0, maxChars), last.slice(maxChars, maxChars * 2)].filter(Boolean);
}

/**
 * Two speakers inside one caption window use the film dash convention:
 *   – Are we agreed on October?
 *   – Yes. Let's lock it.
 */
export function dashDialogue(lines: string[]): string[] {
  return lines.map((l) => `– ${l}`);
}
