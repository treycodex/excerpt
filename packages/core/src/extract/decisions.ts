import type { Item, ItemState } from '@excerpt/types';
import type { Sentence } from './types';
import { normalise } from './sentences';

/**
 * Verbs that complete a commitment cue without committing to anything.
 *
 * The templates below take any verb, because the verb is the part that varies
 * without limit: "let's ship it", "let's shift the budget", "let's brief the
 * client" are one construction, and enumerating the verb meant only the dozen
 * somebody happened to think of ever matched — "let's shift" found nothing while
 * "let's move" found a decision. What a cue cannot carry is a verb of perception
 * or deliberation: "let's see", "we'll think it over" are the same shape and
 * settle nothing.
 */
const UNSETTLED = [
  'see', 'think', 'consider', 'discuss', 'talk', 'chat', 'revisit', 'wait', 'hold',
  'watch', 'explore', 'assess', 'evaluate', 'hope', 'try', 'know', 'find', 'figure',
  'decide', 'debate', 'weigh', 'monitor', 'imagine', 'guess', 'suppose', 'recap',
  'start', 'begin', 'continue', 'say', 'be', 'get', 'have', 'do', 'go', 'need',
  'want', 'let', 'keep', 'look', 'check', 'review', 'assume', 'pretend', 'remember',
  // Deferral, which is the same case as the future-discussion guard below:
  // "let's park that for now" settles the timing of a conversation, not the
  // thing being talked about.
  'park', 'table', 'shelve', 'defer', 'postpone', 'pause',
].join('|');

/** Progressive forms that report a state rather than settle a course. */
const UNSETTLED_ING = [
  'going', 'looking', 'talking', 'thinking', 'hearing', 'getting', 'trying', 'hoping',
  'waiting', 'wondering', 'saying', 'asking', 'expecting', 'seeing', 'planning',
  'considering', 'discussing', 'reviewing', 'checking', 'leaning', 'being', 'having',
].join('|');

/**
 * A cue followed by a real verb and at least one more word. The trailing word is
 * what separates "Let's ship the October cut" from a bare "Let's go."
 */
const settled = (cue: string) =>
  new RegExp(`${cue}\\s+(?!(?:${UNSETTLED})\\b)\\w+\\s+\\w+`, 'i');

/** Commitment: something is being settled, not floated. */
const COMMIT = [
  /\blet'?s\s+(go with|move|do|lock|ship|call it)\b/i,
  /\bwe(?:'re| are)\s+(going with|moving|sticking with)\b/i,
  /\bwe'?ll\s+(go with|move|ship|lock|take)\b/i,
  /\bthat'?s\s+(decided|settled|final)\b/i,
  /\bwe(?:'ve| have)\s+decided\b/i,
  // "movies are locked in by..." is not a decision. These cues only count when the
  // subject is the thing being settled.
  /\b(we|they|everyone|both sides)\s+(all\s+)?agreed\b/i,
  /\b(we(?:'re| are)|that'?s|it'?s|this is)\s+locked in\b/i,
  /\b(we|they|legal|finance|procurement|the client)\s+(signed off|approved)\b/i,

  // How a decision that has just been taken is actually reported. Every one of
  // these was missed while only the forward-looking forms were listed, and the
  // past tense is the commoner way to say it: "we went with the coastline cut".
  /\bwe\s+(went with|decided on|decided to|settled on|landed on|agreed on|agreed to|opted for|opted to|chose|picked|selected)\b/i,

  // The same cues, open to any verb.
  settled("\\blet'?s"),
  settled("\\bwe(?:'?ll| will|'?re going to| are going to)"),
  new RegExp(`\\bwe(?:'re| are)\\s+(?!(?:${UNSETTLED}|${UNSETTLED_ING})\\b)\\w+ing\\b`, 'i'),
];

/**
 * A decision not to do something is still a decision, and dropping it loses the
 * half of a review where things get cut. These are read before the negation
 * guard, which exists to stop a *positive* cue being read through a "not".
 */
const NEGATIVE_COMMIT = [
  /\bwe(?:'re| are)\s+(?:not|no longer)\s+\w+ing\b/i,
  /\bwe(?:'re| are)\s+(?:not|no longer)\s+going to\b/i,
  /\bwe\s+(?:(?:'ve|have)\s+)?(?:decided|agreed|opted)\s+(?:not to|against)\b/i,
  /\bwe(?:'?ll| will)\s+not\b/i,
  /\bwe\s+won'?t\b/i,
  /\bwe(?:'re| are)\s+(dropping|killing|cutting|scrapping|pulling)\b/i,
  /\bwe\s+(dropped|scrapped|killed|shelved|cancelled|canceled|pulled)\b/i,
  /\b(that|it|this|the \w+)(?:'s| is)\s+(off the table|not happening|cancelled|canceled)\b/i,
];

/**
 * A negation that narrows a plan rather than settling against one. "We're not
 * moving the whole campaign, just the hero spot" decides to move something; read
 * as a negative decision it would report the opposite of what was said.
 */
const CONTRAST = /\b(just|only|instead|rather|except|but)\b/i;

/** Suggestion: floated, not settled. */
const PROPOSE = [
  /\bwhat if\b/i,
  /\bwe could\b/i,
  /\bi'?d\s+suggest\b/i,
  /\bmaybe we\b/i,
  /\bhow about\b/i,
  /\bshould we\b/i,
  /\bwe\s+(should|ought to)\b/i,
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

/** Every guard but negation, which a negative decision trips by definition. */
const NEGATIVE_GUARDS = GUARDS.filter((g) => g.name !== 'negation');

export interface Detection {
  sentence: Sentence;
  state: ItemState;
  blockedBy?: string;
}

/** Classify one sentence. Exported for tests — the guards are the product. */
export function classify(sentence: Sentence): Detection | null {
  const text = sentence.norm;

  // A question is never a decision, whatever cues it contains.
  if (/\?\s*$/.test(text)) {
    return PROPOSE.some((r) => r.test(text)) ? { sentence, state: 'proposed' } : null;
  }

  if (NEGATIVE_COMMIT.some((r) => r.test(text)) && !CONTRAST.test(text)) {
    const tripped = NEGATIVE_GUARDS.find((g) => g.re.test(text));
    if (!tripped) return { sentence, state: 'decided' };
    return { sentence, state: 'proposed', blockedBy: tripped.name };
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
  const bare = normalise(text).replace(/^\s*(okay|ok|so|right|well|alright)[,.]?\s+/i, '').trim();
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
