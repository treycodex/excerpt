import type { TranscriptEvent } from '@excerpt/types';

export interface Sentence {
  text: string;
  event: TranscriptEvent;
}

/**
 * Splits final events into sentences, keeping each sentence tied to the event it
 * came from. Evidence is exact by construction: a quote is always a verbatim
 * substring of one real transcript event, never a paraphrase or a join.
 */
export function toSentences(events: TranscriptEvent[]): Sentence[] {
  const out: Sentence[] = [];
  for (const event of events) {
    if (!event.isFinal) continue;
    const parts = event.text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const text of parts.length ? parts : [event.text.trim()]) {
      if (text) out.push({ text, event });
    }
  }
  return out;
}
