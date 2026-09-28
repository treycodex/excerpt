import type { Item, Meeting, NoteBullet, NotesDocument, NoteTopic } from '@excerpt/types';
import { extractItems } from '../extract';
import { toSentences } from '../extract/sentences';
import { classifyAction } from '../extract/actions';
import type { Sentence } from '../extract/types';

const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sourceKey = (bullet: NoteBullet) => bullet.evidence.map((e) => `${e.eventIds.join('|')}:${e.quote}`).join('|');

/**
 * Words too common to tell one sentence from another. Short words are excluded by
 * length, so this only needs the long ones that carry no subject.
 */
const COMMON = new Set(['about', 'actually', 'again', 'against', 'already', 'also', 'always',
  'another', 'anything', 'around', 'because', 'been', 'before', 'being', 'between', 'both',
  'could', 'course', 'does', 'doing', 'down', 'each', 'else', 'even', 'ever', 'every',
  'everyone', 'from', 'gonna', 'going', 'good', 'have', 'here', 'into', 'just', 'kind',
  'know', 'like', 'little', 'look', 'looks', 'lot', 'make', 'many', 'maybe', 'mean',
  'more', 'most', 'much', 'need', 'never', 'nothing', 'okay', 'only', 'other', 'over',
  'people', 'really', 'right', 'said', 'same', 'say', 'see', 'should', 'some', 'someone',
  'something', 'sort', 'still', 'such', 'sure', 'take', 'than', 'that', 'their', 'them',
  'then', 'there', 'these', 'they', 'thing', 'things', 'think', 'this', 'those', 'through',
  'time', 'very', 'want', 'well', 'were', 'what', 'when', 'where', 'which', 'while',
  'will', 'with', 'would', 'yeah', 'your']);

/**
 * The words this particular meeting keeps returning to.
 *
 * The fixed list below — launch, budget, pricing, revenue — is a good signal for the
 * meetings it was written for and no signal at all for anything else, which is how a
 * recording about college and side income scored zero on its own subject matter.
 * A term the speakers themselves came back to is the same signal without the
 * vocabulary lock-in, and it is still counting, not guessing.
 */
function recurringTerms(texts: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const word of text.toLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]{3,}/gu) ?? []) {
      if (COMMON.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word]) => word));
}

const substance = (text: string, recurring: Set<string> = new Set()) => {
  let score = 0;
  if (/\b(agreed|decided|confirmed|approved|blocked|pending|risk|problem|confusing|concern|needs?|must|deadline)\b/i.test(text)) score += 4;
  if (/\b(up|down|increased|decreased|improved|reduced|loses?|runs? long|too|not|isn't|cannot)\b/i.test(text)) score += 2;
  if (/\b(launch|budget|pricing|customer|client|completion|revenue|cost|feedback|onboarding|approval)\b/i.test(text)) score += 2;
  if (recurring.size) {
    const hits = new Set((text.toLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]{3,}/gu) ?? []).filter((w) => recurring.has(w)));
    if (hits.size >= 2) score += 2;
    else if (hits.size === 1) score += 1;
  }
  if (/[0-9%]|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|million|percent)\b/i.test(text)) score++;
  if (/\?$/.test(text)) score -= 2;
  return score;
};

/** Below this a capture is too short to say anything about its shape. */
const SHAPE_MIN_WORDS = 200;

/**
 * What kind of recording this is, when it is not the kind Excerpt is for.
 *
 * A training video, a talk or a webinar is one voice for its whole length, and the
 * four categories — decision, action, deadline, question — are things people settle
 * *between* them. Extraction is working exactly as designed when it finds almost
 * nothing in a lecture, and the notes still come out thin. Saying which of those is
 * happening is the difference between a tool that looks broken and one that has told
 * you what it is for.
 *
 * One voice means one voice in the recording, which is all two streams can ever
 * reveal: it cannot count people in a room, and must never imply that it can.
 */
export function shapeNotice(meeting: Meeting): string | undefined {
  const finals = meeting.events.filter((e) => e.isFinal && /[\p{L}\p{N}]/u.test(e.text));
  if (!finals.length) return undefined;
  const words = finals.reduce((total, e) => total + e.text.split(/\s+/).filter(Boolean).length, 0);
  if (words < SHAPE_MIN_WORDS) return undefined;
  const voices = new Set(finals.map((e) => `${e.role}:${e.speakerLabel}`));
  if (voices.size > 1) return undefined;
  return 'Only one voice was recorded. Excerpt looks for the decisions, actions, '
    + 'deadlines and questions people settle between them, so a talk or a recording '
    + 'leaves it little to find.';
}

/**
 * How much of a meeting comes back as notes has to follow the meeting.
 *
 * Both ends of this were fixed constants: five key points whether the call ran
 * five minutes or ninety, and an uncapped discussion list under one heading. An
 * eighteen-minute meeting produced seventy bullets in a single run, which is a
 * filtered transcript rather than notes, and the same meeting at an hour produced
 * three times that with the same five points on top.
 */
const KEY_POINTS_MIN = 5;
const KEY_POINTS_MAX = 12;
/** A passage is ten minutes of the meeting. Long enough to hold a subject. */
const PASSAGE_MS = 10 * 60 * 1000;
/** Excerpts kept from each passage, so selection is spread over the meeting
    rather than taken from whichever stretch happened to be densest. */
const PER_PASSAGE = 8;

const at = (bullet: NoteBullet) => bullet.evidence[0]?.tArrived ?? 0;

/** Meeting-relative span of what was selected, in milliseconds. */
function span(bullets: NoteBullet[]): number {
  if (bullets.length < 2) return 0;
  const times = bullets.map(at);
  return Math.max(...times) - Math.min(...times);
}

function keyPointBudget(ms: number): number {
  const minutes = ms / 60_000;
  return Math.max(KEY_POINTS_MIN, Math.min(KEY_POINTS_MAX, Math.round(minutes / 10) + 3));
}

/** Meeting-relative clock, the same one the Strip is marked with. */
function stamp(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Chronological passages, titled by the clock.
 *
 * A time range is a fact about the recording. Naming these sections by subject
 * would be the invented heading of `NOTE-QUALITY-PLAN.md` §2.1 arriving from the
 * other direction — this time from keyword counting rather than from a model.
 */
function passages(bullets: NoteBullet[], recurring: Set<string>, end: number): NoteTopic[] {
  if (!bullets.length) return [];
  if (span(bullets) < PASSAGE_MS) {
    return [{ id: 'discussion', title: 'Discussion excerpts', bullets }];
  }

  const t0 = Math.min(...bullets.map(at));
  const groups = new Map<number, NoteBullet[]>();
  for (const bullet of bullets) {
    const slot = Math.floor((at(bullet) - t0) / PASSAGE_MS);
    (groups.get(slot) ?? groups.set(slot, []).get(slot)!).push(bullet);
  }

  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([slot, group]) => ({
    id: `passage-${slot}`,
    // The last passage ends where the recording does. A range that runs past the
    // end of the meeting names time the transcript does not contain.
    title: `${stamp(slot * PASSAGE_MS)} – ${stamp(Math.min((slot + 1) * PASSAGE_MS, end))}`,
    bullets: [...group]
      .sort((a, b) => substance(b.text, recurring) - substance(a.text, recurring))
      .slice(0, PER_PASSAGE)
      .sort((a, b) => at(a) - at(b)),
  })).filter((topic) => topic.bullets.length > 0);
}

/**
 * A bullet that opens by pointing at something it does not name.
 *
 * Selection is per sentence, so "It might come back in January." could be chosen
 * while "Budget, mostly." — the sentence that says what "it" is — was not. The
 * excerpt is then quoted correctly and means nothing.
 */
const STRANDED = /^\s*(it|this|that|these|those|they|he|she|there|then|which|both|either|neither)\b/i;

/**
 * Carry the sentence before a stranded opener, when it can honestly be carried.
 *
 * Only from the same speaker and within a short gap: a pronoun answered across a
 * change of voice belongs to a different turn, and joining those would invent a
 * connection rather than restore one. The two sentences are joined as text and
 * both sets of evidence are kept, so every word still points at the passage it
 * came from.
 */
const ANTECEDENT_GAP_MS = 15_000;

function withAntecedent(sentence: Sentence, previous: Sentence | undefined) {
  if (!previous || !STRANDED.test(sentence.text)) return undefined;
  if (previous.event.role !== sentence.event.role) return undefined;
  if (previous.event.speakerLabel !== sentence.event.speakerLabel) return undefined;
  const gap = sentence.event.tArrived - previous.event.tArrived;
  if (gap < 0 || gap > ANTECEDENT_GAP_MS) return undefined;
  // A long lead-in is its own excerpt; this is for the short fragment that
  // stranded the pronoun, not for gluing two full sentences together.
  if (previous.text.split(/\s+/).length > 12) return undefined;
  return {
    text: `${previous.text} ${sentence.text}`,
    evidence: [...(previous.evidence ?? []), ...(sentence.evidence ?? [])],
  };
}

/** A useful offline fallback. These are excerpts, not claimed model summaries. */
export function buildNotesDocument(meeting: Meeting): NotesDocument {
  const seen = new Set<string>();
  const bullets: NoteBullet[] = [];
  const sentences = toSentences(meeting.events);
  const recurring = recurringTerms(sentences.map((s) => s.text));
  for (const sentence of sentences) {
    if (sentence.text.split(/\s+/).length < 6 || /^(?:hi|hello|thanks|thank you|can you hear me)\b|\b(?:we're all here|we are all here|flag one thing|this morning)\b/i.test(sentence.text)) continue;
    if (substance(sentence.text, recurring) < 2 && !classifyAction(sentence)) continue;
    // A repeated sentence in the same passage is noise; the same subject returning
    // much later belongs to the later part of the meeting.
    const key = `${normal(sentence.text)}|${Math.floor(sentence.event.tArrived / PASSAGE_MS)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const joined = withAntecedent(sentence, sentences[sentence.index - 1]);
    bullets.push({ id: `point-${sentence.event.id}-${sentence.index}`,
      text: joined?.text ?? sentence.text,
      evidence: joined?.evidence ?? sentence.evidence ?? [] });
  }
  const decisions = meeting.items.filter((i) => i.category === 'decision' && i.state === 'decided' && !i.dismissed)
    .map((i) => ({ id: `point-${i.id}`, text: i.title, evidence: i.evidence }));
  const keyPoints = [...decisions];
  for (const bullet of [...bullets].sort((a, b) => substance(b.text, recurring) - substance(a.text, recurring))) {
    if (!keyPoints.some((b) => normal(b.text) === normal(bullet.text))) keyPoints.push(bullet);
  }
  const notice = shapeNotice(meeting);
  return { version: 1, method: 'extractive', ...(notice ? { notice } : {}),
    keyPoints: keyPoints.slice(0, keyPointBudget(span(bullets))),
    topics: passages(bullets, recurring, sentences.at(-1)?.event.tArrived ?? 0) };
}

/** A short verbatim topic from supported speech; no model or invented subject. */
export function suggestMeetingTitle(meeting: Meeting): string | undefined {
  const source = meeting.items.find((item) => item.category === 'decision' && !item.dismissed)?.title
    ?? buildNotesDocument(meeting).keyPoints[0]?.text;
  if (!source) return undefined;
  const words = source.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').split(' ');
  if (words.length < 3) return undefined;
  let title = words.slice(0, 10).join(' ');
  if (title.length > 64) title = title.slice(0, 64).replace(/\s+\S*$/, '');
  return title.length >= 12 ? title[0]!.toUpperCase() + title.slice(1) : undefined;
}

/** Regeneration cannot erase edits, including an edited point no longer selected. */
export function preserveNoteEdits(next: NotesDocument, previous?: NotesDocument): NotesDocument {
  if (!previous) return next;
  const used = new Set<string>();
  const merge = (fresh: NoteBullet[], old: NoteBullet[]) => {
    const result = fresh.map((bullet) => {
      const edited = old.find((b) => b.userEdited && !used.has(b.id) && sourceKey(b) === sourceKey(bullet));
      if (!edited) return bullet;
      used.add(edited.id);
      return edited;
    });
    return result.concat(old.filter((b) => b.userEdited && !used.has(b.id)).map((b) => { used.add(b.id); return b; }));
  };
  const keyPoints = merge(next.keyPoints, previous.keyPoints);
  const oldDiscussion = previous.topics.flatMap((t) => t.bullets);
  const topics = next.topics.map((topic) => ({ ...topic, bullets: topic.bullets.map((bullet) => {
    const edited = oldDiscussion.find((b) => b.userEdited && !used.has(b.id) && sourceKey(b) === sourceKey(bullet));
    if (!edited) return bullet;
    used.add(edited.id); return edited;
  }) }));
  const retained = oldDiscussion.filter((b) => b.userEdited && !used.has(b.id));
  if (retained.length) topics.push({ id: 'retained-edits', title: 'Your notes', bullets: retained });
  return { ...next, keyPoints, topics };
}

export function refreshMeetingNotes(meeting: Meeting): Meeting {
  const fresh = extractItems(meeting.events, new Date(meeting.startedAt));
  const protectedItems = meeting.items.filter((i) => i.userEdited || i.dismissed || i.completed);
  const itemSource = (item: Item) => item.evidence.map((e) => `${e.eventIds.join('|')}:${e.quote}`).join('|');
  const items = fresh.filter((i) => !protectedItems.some((old) => itemSource(old) === itemSource(i)));
  items.push(...protectedItems);
  const next = { ...meeting, items };
  return { ...next, notes: preserveNoteEdits(buildNotesDocument(next), meeting.notes) };
}
