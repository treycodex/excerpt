import type { Item } from '@excerpt/types';

/**
 * Two items about one commitment, offered as a question rather than merged.
 *
 * A review asks people to reconcile fragments of one evolving outcome: "Can you
 * send the client the revised deck before Friday?" and "I'll take the revised deck
 * and get it over by Thursday" are one piece of work and two items, and the
 * de-duplication in `extract/index.ts` cannot join them — it is pairwise-exact on
 * category, state, assignee, due, title, speaker and a thirty-second window, and
 * every one of those differs here. Widening it would start guessing.
 *
 * So nothing is merged. A relation is a proposal with its evidence attached: the
 * shape of the pair, the words they share, and how far apart they were said. The
 * reader confirms or rejects it, which is the only thing in this codebase allowed
 * to assert that two utterances were about the same thing.
 */
export type RelationKind = 'request-commitment' | 'proposal-decision';

export interface ItemRelation {
  /** The later item: the commitment, or the decision. */
  itemId: string;
  /** The earlier item it appears to answer. */
  relatedId: string;
  kind: RelationKind;
  /** Words both items use. The whole of the evidence for the link. */
  shared: string[];
}

/**
 * Words too common to mean two sentences are about the same thing.
 *
 * Deliberately separate from `scoring.ts`'s list, which answers a different
 * question — what a person said they care about. Here the risk is the opposite:
 * a shared "deck" is signal, a shared "think" is not.
 */
const COMMON = new Set([
  'about', 'after', 'again', 'against', 'already', 'also', 'another', 'around',
  'back', 'because', 'been', 'before', 'being', 'below', 'between', 'both',
  'come', 'coming', 'could', 'does', 'doing', 'down', 'each', 'else', 'even',
  'ever', 'every', 'from', 'give', 'going', 'good', 'have', 'here', 'into',
  'just', 'keep', 'kind', 'know', 'later', 'like', 'look', 'make', 'many',
  'maybe', 'mean', 'more', 'most', 'much', 'need', 'needs', 'next', 'once',
  'only', 'other', 'over', 'part', 'past', 'people', 'plan', 'really', 'right',
  'same', 'says', 'send', 'sent', 'should', 'some', 'soon', 'still', 'such',
  'sure', 'take', 'taken', 'than', 'that', 'their', 'them', 'then', 'there',
  'these', 'they', 'thing', 'things', 'think', 'this', 'those', 'through',
  'time', 'today', 'very', 'want', 'week', 'well', 'were', 'what', 'when',
  'where', 'which', 'while', 'will', 'with', 'would', 'your',
]);

/**
 * Content words, loosely stemmed.
 *
 * A plural and its singular are the same subject — "the revised decks" answers
 * "the revised deck" — so a trailing `s` is dropped. Nothing cleverer: a real
 * stemmer would start collapsing words that are not the same, and the point of
 * this list is to be checkable by the person reading it on screen.
 */
function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}][\p{L}\p{N}'-]{3,}/gu) ?? [];
  return new Set(words
    .filter((word) => !COMMON.has(word))
    .map((word) => (word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word)));
}

/** Words two items share, in the later item's order. */
function shared(a: Item, b: Item): string[] {
  const first = contentWords(a.title);
  return [...contentWords(b.title)].filter((word) => first.has(word));
}

const started = (item: Item) => item.evidence[0]?.tArrived ?? 0;

/** Beyond this, two mentions of the same words are a topic, not a thread. */
const WINDOW_MS = 10 * 60 * 1000;
/** Fewer shared words than this and the link is a coincidence. */
const MIN_SHARED = 2;

/**
 * What shape of pair this is, if any.
 *
 * Only two shapes, both of which a reader can check at a glance: something asked
 * of the room and then taken on, and something floated and then settled. A
 * general "these look similar" suggestion would be a guess wearing the costume of
 * a finding.
 */
function relation(earlier: Item, later: Item): RelationKind | undefined {
  if (earlier.category === 'action' && later.category === 'action'
    && earlier.assignee === 'unassigned' && later.assignee !== 'unassigned') {
    return 'request-commitment';
  }
  if (earlier.category === 'decision' && earlier.state === 'proposed'
    && later.category === 'decision' && later.state === 'decided') {
    return 'proposal-decision';
  }
  return undefined;
}

/**
 * Has the reader already said these two are not the same thing?
 *
 * Checked in both directions. A rejection is a statement about the pair, not
 * about whichever of them happened to be offered.
 */
function declined(a: Item, b: Item): boolean {
  return a.unrelated?.includes(b.id) === true || b.unrelated?.includes(a.id) === true;
}

/**
 * Relations worth offering, at most one per item.
 *
 * A review that asks three questions about one bullet is worse than the duplicate
 * it was trying to resolve.
 *
 * Editing an item no longer suppresses its suggestions. That was how a declined
 * suggestion used to be remembered, and it conflated two different things:
 * fixing a typo in a title said nothing about whether the item was the same
 * commitment as another, but it silenced the question for good.
 */
export function relateItems(items: Item[]): ItemRelation[] {
  const live = items.filter((item) => !item.dismissed);
  const relations: ItemRelation[] = [];

  for (let i = 0; i < live.length; i++) {
    const later = live[i]!;

    let best: ItemRelation | undefined;
    for (let j = 0; j < live.length; j++) {
      if (i === j) continue;
      const earlier = live[j]!;
      if (declined(later, earlier)) continue;

      const gap = started(later) - started(earlier);
      if (gap <= 0 || gap > WINDOW_MS) continue;

      const kind = relation(earlier, later);
      if (!kind) continue;

      const words = shared(earlier, later);
      if (words.length < MIN_SHARED) continue;

      if (!best || words.length > best.shared.length) {
        best = { itemId: later.id, relatedId: earlier.id, kind, shared: words };
      }
    }
    if (best) relations.push(best);
  }
  return relations;
}
