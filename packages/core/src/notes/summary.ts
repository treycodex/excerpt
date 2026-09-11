import type { Item, Meeting, NoteBullet, NotesDocument } from '@excerpt/types';
import { extractItems } from '../extract';
import { toSentences } from '../extract/sentences';
import { classifyAction } from '../extract/actions';

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

/** Display a task as a verb phrase while retaining its original evidence. */
export function noteTitle(item: Item): string {
  if (item.category !== 'action' || item.userEdited) return item.title;
  const text = item.title.replace(/^(?:okay[, ]+|so[, ]+)?(?:i(?:['’]ll| will| can)|let me|can you|could you|would you|please)\s+/i, '').replace(/\?$/, '.');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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

/** A useful offline fallback. These are excerpts, not claimed model summaries. */
export function buildNotesDocument(meeting: Meeting): NotesDocument {
  const seen = new Set<string>();
  const bullets: NoteBullet[] = [];
  const sentences = toSentences(meeting.events);
  const recurring = recurringTerms(sentences.map((s) => s.text));
  for (const sentence of sentences) {
    if (sentence.text.split(/\s+/).length < 6 || /^(?:hi|hello|thanks|thank you|can you hear me)\b|\b(?:we're all here|we are all here|flag one thing|this morning)\b/i.test(sentence.text)) continue;
    if (substance(sentence.text, recurring) < 2 && !classifyAction(sentence)) continue;
    const key = normal(sentence.text);
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push({ id: `point-${sentence.event.id}-${sentence.index}`, text: sentence.text,
      evidence: sentence.evidence ?? [] });
  }
  const decisions = meeting.items.filter((i) => i.category === 'decision' && i.state === 'decided' && !i.dismissed)
    .map((i) => ({ id: `point-${i.id}`, text: i.title, evidence: i.evidence }));
  const keyPoints = [...decisions];
  for (const bullet of [...bullets].sort((a, b) => substance(b.text, recurring) - substance(a.text, recurring))) {
    if (!keyPoints.some((b) => normal(b.text) === normal(bullet.text))) keyPoints.push(bullet);
  }
  // Chronological passages keep context without pretending keyword matches infer a topic.
  const topics = bullets.length ? [{ id: 'discussion', title: 'Discussion excerpts', bullets }] : [];
  const notice = shapeNotice(meeting);
  return { version: 1, method: 'extractive', ...(notice ? { notice } : {}),
    keyPoints: keyPoints.slice(0, 5), topics };
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
