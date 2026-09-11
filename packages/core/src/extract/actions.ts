import type { Assignee, Sentence } from './types';

/** First-person commitment. The speaker is taking this on themselves. */
const SELF_COMMIT = [
  /\bi(?:'?ll| will)\s+(review|check|confirm|schedule|update|share|prepare|book|follow up|publish|complete|finish|test|fix|create)\b/i,
  /\bi'?ll\s+(take|own|do|send|handle|get|write|draft|pick up|sort)\b/i,
  /\bi\s+can\s+(take|own|do|send|handle|get|write|draft)\b/i,
  /\bi'?ve\s+got\s+(it|this|that)\b/i,
  /\blet\s+me\s+(take|do|send|handle|get|write|draft)\b/i,
  /\bi'?ll\s+own\b/i,
];

/** A request or assignment aimed at somebody — but we cannot tell whom. */
const REQUEST = [
  /\bcan\s+you\s+\w+/i,
  /\bcould\s+you\s+\w+/i,
  /\bwould\s+you\s+\w+/i,
  /\bplease\s+(send|write|draft|share|update|check)\b/i,
  /\b(?:you|we)'?ll\s+need\s+to\b/i,
  /\bneeds?\s+to\s+be\s+(sent|done|written|drafted|shared)\b/i,
  /\b\w+\s+will\s+(take|own|send|handle|draft)\b/i,
];

/**
 * Commitment-shaped phrases that commit to nothing. "I'll do my best" matches a
 * self-commitment pattern and is not an action item; it was the first false
 * positive a real capture produced.
 */
const VAGUE = [
  /\bi'?ll\s+(do|try|give)\s+(my\s+best|it\s+a\s+go|it\s+a\s+shot|it\s+justice|the\s+same)\b/i,
  /\bi'?ll\s+(see|think about it|let you know|keep you posted|be honest|admit)\b/i,
  /\bi'?ll\s+do\s+(my|our|his|her|their)\b/i,
];

export interface ActionMatch {
  assignee: Assignee;
  /** True when a request was aimed at somebody we cannot identify. */
  ambiguous: boolean;
}

/**
 * Assignment is deliberately conservative.
 *
 * The two audio streams tell us who SPOKE. They do not tell us whom a remote
 * speaker was ADDRESSING — in a three-person call "can you send that?" may well
 * mean somebody else. So "assigned to you" is claimed only for explicit
 * self-commitment from your own microphone. Everything else is unassigned and
 * goes to Needs review, where one click fixes it.
 */
export function classifyAction(sentence: Sentence): ActionMatch | null {
  const text = sentence.norm;
  const fromYou = sentence.event.role === 'you';

  if (/\b(if|unless|hypothetically|maybe)\b/i.test(text) || /\b(?:can|could) you (?:hear|see|imagine|believe|remember|explain|tell me)\b/i.test(text)) return null;

  if (VAGUE.some((r) => r.test(text))) return null;

  if (SELF_COMMIT.some((r) => r.test(text))) {
    return fromYou
      ? { assignee: 'you', ambiguous: false }      // you committed, on your own mic
      : { assignee: 'unassigned', ambiguous: false }; // somebody else committed
  }

  if (REQUEST.some((r) => r.test(text))) {
    return { assignee: 'unassigned', ambiguous: true };
  }
  return null;
}
