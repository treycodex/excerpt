import type { Sentence } from './types';

/** A direct answer opens with one of these. */
const ANSWER = /^\s*(yes|yeah|yep|no|nope|correct|right|exactly|sure|absolutely|definitely|we do|we don'?t|it is|it isn'?t)\b/i;

/** Hedges mean the question is still open, however long the reply was. */
const HEDGE = /\b(not sure|i think|i guess|maybe|possibly|probably|we'?ll discuss|let me check|circle back|come back to|find out|good question|depends|tbd|to be honest i don'?t know)\b/i;

/** Rhetorical or procedural questions that are not open questions. */
const NOT_A_QUESTION = [
  /^\s*(what if|how about|should we|shall we)\b/i,   // proposals, handled elsewhere
  /^\s*(does that (make sense|work)|any questions|sound good|okay|right)\b/i,
  /^\s*(can you hear me|are you there|can everyone see)\b/i,
];

const WINDOW_MS = 30_000;

/**
 * A question is OPEN unless somebody actually answered it.
 *
 * "Answered" is deliberately strict: a reply that hedges ("I'm not sure the
 * out-of-home spend is justified yet") leaves the question open, which is the
 * whole reason a user wants this list.
 */
export function isOpenQuestion(sentence: Sentence, all: Sentence[]): boolean {
  if (!/\?\s*$/.test(sentence.text)) return false;
  if (NOT_A_QUESTION.some((r) => r.test(sentence.text))) return false;

  for (let i = sentence.index + 1; i < all.length; i++) {
    const next = all[i];
    if (!next) break;
    if (next.event.tArrived - sentence.event.tArrived > WINDOW_MS) break;
    if (next.event.role === sentence.event.role) continue;  // the asker restating
    if (HEDGE.test(next.text)) continue;                    // hedged: still open
    if (ANSWER.test(next.text)) return false;               // answered outright
    if (!/\?\s*$/.test(next.text) && next.text.split(' ').length >= 6) return false;
  }
  return true;
}
