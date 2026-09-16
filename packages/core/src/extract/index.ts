import type { Item, ItemState, TranscriptEvent } from '@excerpt/types';
import { classifyAction } from './actions';
import { classify, isBareConfirmation } from './decisions';
import { findDeadline } from './deadlines';
import { isOpenQuestion } from './questions';
import { toSentences } from './sentences';
import type { Sentence } from './types';

const MAX_TITLE_WORDS = 18;

/**
 * An extractive title: a verbatim SPAN of what was said, never a rewrite.
 *
 * Live speech arrives without reliable punctuation, so a "sentence" can be a
 * 25-word run-on. When that happens the title is trimmed to the clause carrying
 * the point and the full passage stays as evidence, which is where the detail
 * belongs anyway.
 */
function title(text: string): string {
  const stripped = text.replace(/^\s*(okay|ok|so|right|well|alright|and|but)[,.]?\s+/i, '').trim();
  if (stripped.split(/\s+/).length <= MAX_TITLE_WORDS) return stripped;

  // Prefer a clause boundary; otherwise cut on the word budget and mark the cut.
  const clauses = stripped.split(/\s*(?:,|;|\s+but\s+|\s+and\s+|\s+because\s+|\s+so\s+)\s*/i);
  const best = clauses.find((c) => c.split(/\s+/).length >= 4) ?? stripped;
  const words = best.split(/\s+/);
  return words.length <= MAX_TITLE_WORDS
    ? best.trim()
    : `${words.slice(0, MAX_TITLE_WORDS).join(' ')}…`;
}

function evidenceOf(s: Sentence) {
  return {
    eventIds: [s.event.id],
    tArrived: s.event.tArrived,
    quote: s.text,
    speakerLabel: s.event.speakerLabel,
    // Carried through only when the source had one. Scrubbing to a quote is
    // audio-accurate on macOS and arrival-approximate in the browser, and the
    // difference has to survive extraction rather than be flattened here.
    ...(s.event.tStart !== undefined ? { tStart: s.event.tStart } : {}),
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
      evidence: s.evidence ?? [evidenceOf(s)],
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

  const unique: Item[] = [];
  for (const item of items) {
    const duplicate = unique.find((previous) => previous.category === item.category && previous.state === item.state &&
      previous.assignee === item.assignee && previous.due === item.due &&
      previous.title.toLowerCase() === item.title.toLowerCase() &&
      previous.evidence[0]?.speakerLabel === item.evidence[0]?.speakerLabel &&
      Math.abs(previous.evidence[0]!.tArrived - item.evidence[0]!.tArrived) < 30_000);
    if (duplicate) duplicate.evidence.push(...item.evidence);
    else unique.push(item);
  }
  return unique.sort((a, b) => (a.evidence[0]?.tArrived ?? 0) - (b.evidence[0]?.tArrived ?? 0));
}

export { classify, extractDecisions, isBareConfirmation } from './decisions';
export { classifyAction } from './actions';
export { isOpenQuestion } from './questions';
export { findDeadline } from './deadlines';
export { toSentences } from './sentences';
export { relateItems } from './relate';
export type { ItemRelation, RelationKind } from './relate';
export type { Sentence } from './types';
