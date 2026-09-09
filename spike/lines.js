// Subtitle line-breaking. Extracted here because TEST 8 needs it and it is the
// caption's soul — this moves to packages/core verbatim.

const BREAK_AFTER = /[.,;:!?—–]$/;
const WEAK_BEFORE = new Set([
  'and','but','or','so','because','if','when','while','that','which','who',
  'to','of','in','on','at','for','with','from','by','as','than','then'
]);

// Returns 1 or 2 lines, breaking on phrase boundaries rather than raw width.
export function splitIntoSubtitleLines(text, maxChars = 42) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const words = clean.split(' ');
  let best = null;

  // Consider every split point; score by how phrase-like the break is and how
  // balanced the two lines are. Lower is better.
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (a.length > maxChars || b.length > maxChars) continue;

    const prev = words[i - 1];
    const next = words[i].toLowerCase().replace(/[^a-z']/g, '');

    let score = Math.abs(a.length - b.length);        // prefer balanced lines
    if (BREAK_AFTER.test(prev)) score -= 28;          // strong: punctuation
    else if (WEAK_BEFORE.has(next)) score -= 14;      // weak: conjunction/preposition
    else score += 6;                                  // mid-phrase break: penalise

    if (!best || score < best.score) best = { score, lines: [a, b] };
  }

  if (best) return best.lines;

  // No split fits in two lines: keep the tail, which is what a viewer is reading.
  const tail = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = [words[i], ...tail].join(' ');
    if (candidate.length > maxChars * 2) break;
    tail.unshift(words[i]);
  }
  return splitIntoSubtitleLines(tail.join(' '), maxChars);
}
