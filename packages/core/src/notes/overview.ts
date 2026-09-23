import type { Evidence, Item, NotesDocument } from '@excerpt/types';
import { evidenceTime, noteDedupeKey } from './editor';

export interface SummaryLine {
  id: string;
  text: string;
  evidence: Evidence[];
}

export const SUMMARY_LIMIT = 3;

/**
 * The few lines at the top of a finished document.
 *
 * Taken from the document's own key points, never composed: each line either is a
 * block the reader can see and edit below (so its current wording is used) or a
 * key point that still cites the transcript. A key point without a passage, or one
 * whose block the reader deleted, is not a supported summary and is left out.
 */
export function documentSummary(notes: NotesDocument, limit = SUMMARY_LIMIT): SummaryLine[] {
  const blocks = new Map((notes.blocks ?? []).map((block) => [block.id, block]));
  const deleted = new Set((notes.deletedBlocks ?? []).map((block) => block.id));
  // editableDocument keeps the first topic bullet when it deduplicates a key
  // point with the same wording and source. Its id can differ from the point's.
  const topicAliases = new Map<string, string>();
  for (const topic of notes.topics) {
    for (const bullet of [...topic.bullets].sort((a, b) =>
      (a.evidence.length ? Math.min(...a.evidence.map(evidenceTime)) : 0)
      - (b.evidence.length ? Math.min(...b.evidence.map(evidenceTime)) : 0))) {
      const key = noteDedupeKey(bullet);
      if (!topicAliases.has(key)) topicAliases.set(key, bullet.id);
    }
  }
  const lines: SummaryLine[] = [];
  const seen = new Set<string>();
  for (const point of notes.keyPoints) {
    const alias = topicAliases.get(noteDedupeKey(point));
    const direct = blocks.get(point.id);
    const counterpart = alias ? blocks.get(alias) : undefined;
    if (deleted.has(point.id) || (!direct && alias && (deleted.has(alias) || (notes.blocks && !counterpart)))) continue;
    const block = direct ?? counterpart;
    const source = block && block.kind !== 'image' ? block : point;
    const text = source.text.replace(/\s+/g, ' ').trim();
    const key = text.toLowerCase();
    if (!text || !source.evidence.length || seen.has(key)) continue;
    seen.add(key);
    lines.push({ id: point.id, text, evidence: source.evidence });
    if (lines.length >= limit) break;
  }
  return lines;
}

const firstHeard = (item: Item) => item.evidence.length ? Math.min(...item.evidence.map(evidenceTime)) : Infinity;

/**
 * Next steps are the meeting's own action and deadline items, not copies of them.
 *
 * The document and detailed review both render these same records by id, so
 * completing, assigning or rewording one in either place is one change to one
 * item. Chronological, because that is how the reader remembers them being said.
 */
export function nextSteps(items: Item[]): Item[] {
  return items
    .filter((item) => !item.dismissed && (item.category === 'action' || item.category === 'deadline'))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => firstHeard(a.item) - firstHeard(b.item) || a.index - b.index)
    .map(({ item }) => item);
}
