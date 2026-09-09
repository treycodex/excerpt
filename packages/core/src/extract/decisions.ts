import type { Item, ItemState } from '@excerpt/types';
import type { Sentence } from './types';

/** Commitment: something is being settled, not floated. */
const COMMIT = [
  /\blet'?s\s+(go with|move|do|lock|ship|call it)\b/i,
  /\bwe(?:'re| are)\s+(going with|moving|sticking with)\b/i,
  /\bwe'?ll\s+(go with|move|ship|lock|take)\b/i,
  /\bthat'?s\s+(decided|settled|final)\b/i,
  /\bwe(?:'ve| have)\s+decided\b/i,
  /\b(agreed|locked in|signed off on)\b/i,
];

/** Suggestion: floated, not settled. */
const PROPOSE = [
  /\bwhat if\b/i,
  /\bwe could\b/i,
  /\bi'?d\s+suggest\b/i,
  /\bmaybe we\b/i,
  /\bhow about\b/i,
  /\bshould we\b/i,
  /\bif\b[^.?!]*\bwe'?ll\b/i,     // conditional commitment is a proposal, not a decision
];

/**
 * Guards. Each one exists because a naive cue match gets it wrong, and a false
 * decision is far worse for this product than a missed one.
 */
const GUARDS: { name: string; re: RegExp }[] = [
  // "we're not moving the whole campaign"
  { name: 'negation', re: /\b(not|n't|never|no longer)\b/i },
  // "if legal signs off, we'll go with October"
  { name: 'conditional', re: /^\s*(if|unless|assuming|provided|once)\b|\bif\b[^.?!]*\bwe'?ll\b/i },
  // "we'll discuss October next week" — a decision to talk, not a decision
  { name: 'future-discussion', re: /\b(discuss|revisit|talk about|circle back|come back to|decide)\b/i },
  // "she said let's go with October"
  { name: 'reported-speech', re: /\b(said|says|mentioned|thinks?|asked)\b/i },
];

export interface Detection {
  sentence: Sentence;
  state: ItemState;
  blockedBy?: string;
}

/** Classify one sentence. Exported for tests — the guards are the product. */
export function classify(sentence: Sentence): Detection | null {
  const text = sentence.text;

  // A question is never a decision, whatever cues it contains.
  if (/\?\s*$/.test(text)) {
    return PROPOSE.some((r) => r.test(text)) ? { sentence, state: 'proposed' } : null;
  }

  const committed = COMMIT.some((r) => r.test(text));
  if (committed) {
    const tripped = GUARDS.find((g) => g.re.test(text));
    if (!tripped) return { sentence, state: 'decided' };
    // A blocked commitment is still worth surfacing — as a proposal, clearly not settled.
    return { sentence, state: 'proposed', blockedBy: tripped.name };
  }

  if (PROPOSE.some((r) => r.test(text))) return { sentence, state: 'proposed' };
  return null;
}

/**
 * Bare confirmations. These match commitment cues but carry no proposition of their
 * own — "That's decided." is not a decision, it is a marker that one just happened.
 * Emitted alone they produce notes that say nothing.
 */
const CONFIRMATION = [
  /^that'?s\s+(decided|settled|final|agreed)\.?$/i,
  /^(agreed|decided|settled|done|locked in|sold)\.?$/i,
  /^we(?:'ve| have)\s+decided\.?$/i,
];

export function isBareConfirmation(text: string): boolean {
  const bare = text.replace(/^\s*(okay|ok|so|right|well|alright)[,.]?\s+/i, '').trim();
  return CONFIRMATION.some((r) => r.test(bare));
}

/** Strip leading filler so the extractive title reads cleanly. Never rewrites words. */
function title(text: string): string {
  return text.replace(/^\s*(okay|ok|so|right|well|alright)[,.]?\s+/i, '').trim();
}

export function extractDecisions(sentences: Sentence[]): Item[] {
  const items: Item[] = [];
  for (const sentence of sentences) {
    const d = classify(sentence);
    if (!d) continue;

    // A confirmation corroborates the decision it follows. Attach it as further
    // evidence rather than emitting a contentless item — and never let it change
    // an item's state, which would be inferring cause from adjacency.
    if (isBareConfirmation(sentence.text)) {
      const prev = items[items.length - 1];
      const close = prev && sentence.event.tArrived - prev.evidence[0]!.tArrived < 30_000;
      if (prev && close && prev.state === 'decided') {
        prev.evidence.push({
          eventIds: [sentence.event.id],
          tArrived: sentence.event.tArrived,
          quote: sentence.text,
          speakerLabel: sentence.event.speakerLabel,
        });
      }
      continue;
    }

    items.push({
      id: `item-${sentence.event.id}-${items.length}`,
      category: 'decision',
      state: d.state,
      title: title(sentence.text),
      evidence: [{
        eventIds: [sentence.event.id],
        tArrived: sentence.event.tArrived,
        quote: sentence.text,
        speakerLabel: sentence.event.speakerLabel,
      }],
      assignee: 'unassigned',
      salience: d.state === 'decided' ? 2 : 1,
    });
  }
  return items;
}
