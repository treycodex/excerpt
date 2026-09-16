import type { Meeting } from '@excerpt/types';

/**
 * Finding a meeting again, without remembering what it was called.
 *
 * Search matched titles only, and a title is almost never something a person
 * chose: capture names meetings `Meeting · <date>`, so title search was largely
 * search over a date string. Everything worth searching — the transcript, the
 * written notes, the captions on captured images — was already in memory, because
 * `readMeetingLibrary` returns whole `Meeting` records. The cost was never the
 * data. It was that nothing looked at it.
 */
export type MeetingMatchKind = 'title' | 'note' | 'moment' | 'transcript';

export interface MeetingMatch {
  meeting: Meeting;
  kind: MeetingMatchKind;
  /** A window of the matching text, for showing what was found. */
  snippet: string;
  /** Where the match sits inside `snippet`, so it can be marked. */
  offset: number;
  length: number;
  /** The transcript event to open at, when the match can name one. */
  eventId?: string;
}

/** Characters either side of a match in the snippet window. */
const CONTEXT = 42;

/**
 * Fold case and accents for comparison only; the snippet is cut from the original.
 *
 * Folding is per character and length-preserving, so an offset found in the folded
 * text still indexes the original. `NFD` then dropping marks would break that —
 * "é" becomes two code units — so combining marks are removed only when they were
 * separate to begin with, and the result is checked against the source length.
 */
function fold(text: string): string {
  const folded = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return folded.length === text.length ? folded : text.toLowerCase();
}

function windowed(text: string, at: number, length: number): MeetingMatch {
  const start = Math.max(0, at - CONTEXT);
  const end = Math.min(text.length, at + length + CONTEXT);
  const lead = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  return {
    snippet: `${lead}${text.slice(start, end).trim()}${tail}`,
    offset: at - start + lead.length,
    length,
  } as MeetingMatch;
}

/** The written notes, whichever shape this document is in. */
function noteTexts(meeting: Meeting): string[] {
  const notes = meeting.notes;
  if (!notes) return [];
  if (notes.blocks?.length) return notes.blocks.map((b) => b.text);
  return [...notes.keyPoints.map((b) => b.text), ...notes.topics.flatMap((t) => t.bullets.map((b) => b.text))];
}

/**
 * The best single match in one meeting, or nothing.
 *
 * One per meeting on purpose: the sidebar is a list of meetings, and turning it
 * into a list of passages would answer a different question from the one the
 * reader asked. Ordered by how directly each field names the meeting.
 */
function bestMatch(meeting: Meeting, needle: string): MeetingMatch | undefined {
  const find = (text: string): { at: number; text: string } | undefined => {
    if (!text) return undefined;
    const at = fold(text).indexOf(needle);
    return at === -1 ? undefined : { at, text };
  };

  const title = find(meeting.title);
  if (title) return { ...windowed(title.text, title.at, needle.length), meeting, kind: 'title' };

  for (const text of noteTexts(meeting)) {
    const hit = find(text);
    if (hit) return { ...windowed(hit.text, hit.at, needle.length), meeting, kind: 'note' };
  }

  for (const image of meeting.images ?? []) {
    const hit = find(image.caption);
    if (hit) return { ...windowed(hit.text, hit.at, needle.length), meeting, kind: 'moment' };
  }

  for (const event of meeting.events) {
    if (!event.isFinal) continue;
    const hit = find(event.text);
    if (hit) {
      return { ...windowed(hit.text, hit.at, needle.length), meeting, kind: 'transcript', eventId: event.id };
    }
  }
  return undefined;
}

/**
 * Meetings containing `query`, in the order they were given.
 *
 * Input order is preserved rather than ranked by kind: the library arrives newest
 * first, and a reader looking for "what did we agree about pricing" is far better
 * served by recency than by whether the phrase happened to land in a title.
 */
export function searchMeetings(meetings: Meeting[], query: string): MeetingMatch[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const matches: MeetingMatch[] = [];
  for (const meeting of meetings) {
    const match = bestMatch(meeting, needle);
    if (match) matches.push(match);
  }
  return matches;
}

/**
 * How many notes a meeting actually holds.
 *
 * The sidebar counted non-dismissed extracted `Item`s and called them notes, so a
 * meeting somebody had written pages into, with screenshots, could read "0 notes"
 * because the extractor had found no decisions in it.
 */
export function meetingNoteCount(meeting: Meeting): number {
  const notes = meeting.notes;
  const written = notes?.blocks?.length
    ? notes.blocks.filter((b) => b.kind === 'image' || b.text.trim()).length
    : noteTexts(meeting).filter((t) => t.trim()).length;
  return written || meeting.items.filter((i) => !i.dismissed).length;
}
