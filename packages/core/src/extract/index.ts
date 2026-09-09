import type { Item, TranscriptEvent } from '@excerpt/types';
import { extractDecisions } from './decisions';
import { toSentences } from './sentences';

/**
 * Day 3-5 slice: decisions only. Actions, deadlines and questions land in days 6-8.
 * The shape is final even though the coverage is not.
 */
export function extractItems(events: TranscriptEvent[]): Item[] {
  return extractDecisions(toSentences(events));
}

export { classify, extractDecisions } from './decisions';
export { toSentences } from './sentences';
export type { Sentence } from './sentences';
