import type { Item, ItemState, TranscriptEvent } from '@excerpt/types';
import { classifyAction } from './actions';
import { classify, isBareConfirmation } from './decisions';
import { findDeadline } from './deadlines';
import { isOpenQuestion } from './questions';
import { toSentences } from './sentences';
import type { Sentence } from './types';

/** Strip leading filler so an extractive title reads cleanly. Never rewrites words. */
function title(text: string): string {
  return text.replace(/^\s*(okay|ok|so|right|well|alright|and|but)[,.]?\s+/i, '').trim();
}

function evidenceOf(s: Sentence) {
  return {
    eventIds: [s.event.id],
    tArrived: s.event.tArrived,
    quote: s.text,
    speakerLabel: s.event.speakerLabel,
  };
}

/**
 * One sentence yields at most one item.
 *
 * Order matters and is not arbitrary. "Can you send the revised deck before
 * Friday?" is an action with a due date — not an action AND a deadline AND a
 * question. Actions win over decisions, decisions over questions, and a bare
 * temporal expression only becomes a standalone deadline when nothing nearby
 * wanted it.
 */
export function extractItems(events: TranscriptEvent[], reference = new Date()): Item[] {
  const sentences = toSentences(events);
  const items: Item[] = [];
  const consumed = new Set<number>();

  const push = (
    s: Sentence,
    category: Item['category'],
    state: ItemState,
    extra: Partial<Item> = {},
  ): Item => {
    const item: Item = {
      id: `item-${s.event.id}-${s.index}`,
      category,
      state,
      title: title(s.text),
      evidence: [evidenceOf(s)],
      assignee: 'unassigned',
      salience: state === 'decided' ? 2 : 1,
      ...extra,
    };
    items.push(item);
    consumed.add(s.index);
    return item;
  };

  for (const s of sentences) {
    // 1 — actions, including requests we cannot attribute
    const action = classifyAction(s);
    if (action) {
      const item = push(s, 'action', 'decided', { assignee: action.assignee });
      const due = findDeadline(s, reference);
      if (due) item.due = due.iso;
      continue;
    }

    // 2 — decisions and proposals
    const decision = classify(s);
    if (decision) {
      if (isBareConfirmation(s.text)) {
        const prev = items[items.length - 1];
        const near = prev && s.event.tArrived - prev.evidence[0]!.tArrived < 30_000;
        if (prev && near && prev.state === 'decided') prev.evidence.push(evidenceOf(s));
        consumed.add(s.index);
        continue;
      }
      const item = push(s, 'decision', decision.state);
      const due = findDeadline(s, reference);
      if (due) item.due = due.iso;
      continue;
    }

    // 3 — questions nobody answered
    if (isOpenQuestion(s, sentences)) {
      push(s, 'question', 'discussed');
      continue;
    }
  }

  // A deadline is only ever read from an item's OWN sentence. Attaching a date
  // found in one sentence to an item from another is the same causal inference
  // that was removed from promotion — and in testing it produced a due date in
  // the past on a sentence containing no deadline at all.
  for (const s of sentences) {
    if (consumed.has(s.index)) continue;
    const due = findDeadline(s, reference);
    if (due) push(s, 'deadline', 'decided', { due: due.iso });
  }

  return items.sort((a, b) => (a.evidence[0]?.tArrived ?? 0) - (b.evidence[0]?.tArrived ?? 0));
}

export { classify, extractDecisions, isBareConfirmation } from './decisions';
export { classifyAction } from './actions';
export { isOpenQuestion } from './questions';
export { findDeadline } from './deadlines';
export { toSentences } from './sentences';
export type { Sentence } from './types';
