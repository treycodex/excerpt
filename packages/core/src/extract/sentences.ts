import type { TranscriptEvent } from '@excerpt/types';
import type { Sentence } from './types';

/**
 * Splits final events into sentences, keeping each tied to the event it came from.
 * Evidence is exact by construction: a quote is always a verbatim substring of one
 * real transcript event, never a paraphrase and never a join across events.
 */
/** Fold typographic punctuation onto its ASCII equivalent for matching only. */
export function normalise(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02BC\u02B9\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...');
}

export function toSentences(events: TranscriptEvent[]): Sentence[] {
  const out: Sentence[] = [];
  for (const event of events) {
    if (!event.isFinal) continue;
    const parts = event.text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const text of parts.length ? parts : [event.text.trim()]) {
      if (text) out.push({ text, norm: normalise(text), event, index: out.length });
    }
  }
  return out;
}
