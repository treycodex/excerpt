import type { Assignee, Sentence } from './types';

/** First-person commitment. The speaker is taking this on themselves. */
const SELF_COMMIT = [
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
