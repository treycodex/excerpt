import type { Evidence, TranscriptEvent } from '@excerpt/types';
import type { Sentence } from './types';

/**
 * Joins adjacent unfinished speech from the same speaker, then splits sentences.
 * Each evidence quote remains an exact substring of its original event, even
 * when the complete sentence spans several recognition results.
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
  const groups: TranscriptEvent[][] = [];
  for (const event of events.filter((e) => e.isFinal && /[\p{L}\p{N}]/u.test(e.text))) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const sameSpeaker = previous?.role === event.role && previous?.speakerLabel === event.speakerLabel;
    const gap = previous ? event.tArrived - previous.tArrived : Infinity;
    if (previous && sameSpeaker && gap >= 0 && gap < 8000 && !/[.!?][”"')]*\s*$/.test(previous.text)) {
      group!.push(event);
    } else groups.push([event]);
  }
  for (const group of groups) {
    let joined = '';
    const spans = group.map((event) => {
      if (joined) joined += ' ';
      const start = joined.length;
      joined += event.text;
      return { event, start, end: joined.length };
    });
    for (const match of joined.matchAll(/[\s\S]+?(?:[.!?]+(?=\s|$)|$)/g)) {
      const text = match[0].trim();
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      const start = match.index!;
      const end = start + match[0].length;
      const evidence: Evidence[] = spans.filter((s) => s.start < end && s.end > start).map((s) => ({
        eventIds: [s.event.id], tArrived: s.event.tArrived, speakerLabel: s.event.speakerLabel,
        quote: s.event.text.slice(Math.max(0, start - s.start), Math.min(s.event.text.length, end - s.start)).trim(),
        ...(s.event.tStart !== undefined ? { tStart: s.event.tStart } : {}),
      }));
      const event = spans.find((s) => s.start < end && s.end > start)!.event;
      out.push({ text, norm: normalise(text), event, index: out.length, evidence });
    }
  }
  return out;
}
