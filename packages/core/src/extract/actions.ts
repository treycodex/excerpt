import type { Assignee, Sentence } from './types';

/**
 * Verbs that follow a commitment cue without taking anything on.
 *
 * As in `decisions.ts`, the cue generalises and the verb does not: "I'll brief the
 * team" and "I'll draft the brief" are one construction, and while the verb was
 * enumerated only the second was an action item. What the cue cannot carry is a
 * verb of perception, opinion or intention — "I'll see", "I'll think about it".
 */
const UNSETTLED = [
  'see', 'think', 'guess', 'know', 'bet', 'say', 'admit', 'be', 'have', 'hope',
  'assume', 'imagine', 'leave', 'let', 'need', 'want', 'remember', 'agree', 'wait',
  'stop', 'try', 'wonder', 'suppose', 'hate', 'love', 'like', 'miss',
].join('|');

/** A cue, a real verb, and something for the verb to act on. */
const commits = (cue: string) =>
  new RegExp(`${cue}\\s+(?!(?:${UNSETTLED})\\b)\\w+\\s+\\w+`, 'i');

/** First-person commitment. The speaker is taking this on themselves. */
const SELF_COMMIT = [
  /\bi(?:'?ll| will)\s+(review|check|confirm|schedule|update|share|prepare|book|follow up|publish|complete|finish|test|fix|create)\b/i,
  /\bi'?ll\s+(take|own|do|send|handle|get|write|draft|pick up|sort)\b/i,
  /\bi\s+can\s+(take|own|do|send|handle|get|write|draft)\b/i,
  /\bi'?ve\s+got\s+(it|this|that)\b/i,
  /\blet\s+me\s+(take|do|send|handle|get|write|draft)\b/i,
  /\bi'?ll\s+own\b/i,

  // The same cues, open to any verb.
  commits("\\bi(?:'?ll| will|'?m going to| am going to)"),
  commits('\\bi\\s+can'),
  commits('\\blet\\s+me'),
];

/** A request or assignment aimed at somebody — but we cannot tell whom. */
const REQUEST = [
  /\bcan\s+you\s+\w+/i,
  /\bcould\s+you\s+\w+/i,
  /\bwould\s+you\s+\w+/i,
  /\bplease\s+(?!note|be|don'?t)\w+/i,
  /\b(?:you|we)'?ll\s+need\s+to\b/i,
  /\bwe\s+need\s+(?:to|a|an|some)\b/i,
  /\b(?:someone|somebody|anyone)\s+(?:needs|has)\s+to\b/i,
  /\bneeds?\s+to\s+be\s+\w+/i,
  // "The end card needs a rework." A need aimed at a thing is still work owed.
  /\bneeds?\s+(?:a|an|another|some)\s+\w+/i,
  /\bdon'?t\s+forget\s+to\b/i,
  /\bmake\s+sure\s+(?:you|we|they|to)\b/i,
  // A third party is committed by somebody else. "We will …" is deliberately not
  // here: a collective commitment is read as a decision, where "we'll …" already
  // went, rather than as an action nobody can be shown to own.
  // Case-sensitive on purpose: a name is recognisable only by its capital, and
  // under /i the proper-noun branch matched every pronoun including "We".
  /\b(?!(?:We|I|You|It|That|This|There|Which|What|Everything|Nothing)\b)(?:[A-Z][a-z]+|he|she|they|[Tt]he (?:team|client|agency)|[Ll]egal|[Dd]esign|[Mm]edia|[Ff]inance)\s+will\s+(?!be\b|have\b|need\b|want\b|see\b|know\b|get\b)\w+/,
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
  /\bi'?ll\s+be\s+(honest|quick|brief|around|there|happy|glad|in touch)\b/i,
  /\bi'?ll\s+(tell|let)\s+you\s+(know|what)\b/i,
  /\blet\s+me\s+(know|think|see|tell you|explain|show you|start by|be clear)\b/i,
  /\bi\s+can\s+(see|tell|hear|imagine|understand|appreciate|assure)\b/i,
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
