import * as chrono from 'chrono-node';
import type { Sentence } from './types';

/**
 * A deadline needs an explicit deadline preposition immediately before the date.
 *
 * Without this, chrono happily reads "I pulled the last four weeks this morning"
 * as a date and Excerpt reports a due date in the past. Requiring the preposition
 * costs us some real deadlines ("it goes live October 15") and that is the right
 * trade: a fabricated due date is far more damaging than a missed one.
 */
const PREPOSITION = /\b(by|before|due|until|no later than|ahead of|in time for)\s+$/i;

export interface Deadline { iso: string; text: string }

export function findDeadline(sentence: Sentence, reference: Date): Deadline | null {
  const text = sentence.text;
  const results = chrono.parse(text, reference, { forwardDate: true });

  for (const r of results) {
    const preceding = text.slice(Math.max(0, r.index - 18), r.index);
    if (!PREPOSITION.test(preceding)) continue;

    const date = r.start.date();
    if (Number.isNaN(date.getTime())) continue;

    // A deadline cannot be in the past relative to the meeting.
    const dayBefore = reference.getTime() - 24 * 60 * 60 * 1000;
    if (date.getTime() < dayBefore) continue;

    return { iso: date.toISOString().slice(0, 10), text: r.text };
  }
  return null;
}
