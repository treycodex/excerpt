import type { Meeting, MeetingImage, NoteBlock, NotesDocument, Evidence } from '@excerpt/types';
import { buildNotesDocument, refreshMeetingNotes } from './summary';

export const evidenceTime = (e: Evidence) => e.tStart !== undefined ? e.tStart * 1000 : e.tArrived;
const timeOf = (evidence: Evidence[]) => evidence.length ? Math.min(...evidence.map(evidenceTime)) : undefined;
export const transcriptEventTime = (event: Meeting['events'][number]) => event.tStart !== undefined ? event.tStart * 1000 : event.tArrived;
const transcriptEventEnd = (event: Meeting['events'][number]) => event.tEnd !== undefined ? event.tEnd * 1000 : transcriptEventTime(event);

export const MOMENT_CONTEXT_BEFORE = 20_000;
export const MOMENT_CONTEXT_AFTER = 15_000;

/** Stable final-source anchors for a captured moment. */
export function meetingImageContext(meeting: Pick<Meeting, 'events'>, at: number, before = MOMENT_CONTEXT_BEFORE, after = MOMENT_CONTEXT_AFTER) {
  const startAt = Math.max(0, at - before);
  const endAt = at + after;
  const eventIds = meeting.events
    .filter((event) => event.isFinal && transcriptEventEnd(event) >= startAt && transcriptEventTime(event) <= endAt)
    .sort((a, b) => transcriptEventTime(a) - transcriptEventTime(b))
    .map((event) => event.id);
  return { eventIds, startAt, endAt };
}

/** Reconcile future speech into image anchors without changing capture time or block order. */
export function reconcileMeetingImageContexts(meeting: Meeting): Meeting {
  if (!meeting.images?.length) return meeting;
  let changed = false;
  const images = meeting.images.map((image) => {
    const context = meetingImageContext(meeting, image.at);
    if (image.context && image.context.startAt === context.startAt && image.context.endAt === context.endAt
      && image.context.eventIds.join('\0') === context.eventIds.join('\0')) return image;
    changed = true;
    return { ...image, context };
  });
  return changed ? { ...meeting, images } : meeting;
}

/** Upgrade only when needed. An existing document's order (including an empty one) is authoritative. */
export function editableDocument(meeting: Meeting): NotesDocument {
  const notes = meeting.notes ?? buildNotesDocument(meeting);
  if (notes.blocks) return notes;
  const seen = new Set<string>();
  const blocks: NoteBlock[] = [];
  const sections = notes.topics.length ? notes.topics : [{ id: 'points', title: '', bullets: notes.keyPoints }];
  for (const section of sections) {
    const bullets = [...section.bullets].sort((a, b) => (timeOf(a.evidence) ?? 0) - (timeOf(b.evidence) ?? 0));
    const first = bullets[0];
    if (section.title && section.title !== 'Discussion excerpts' && first) {
      blocks.push({ id: `heading-${section.id}`, kind: 'heading', text: section.title,
        evidence: bullets.flatMap((bullet) => bullet.evidence),
        ...(timeOf(first.evidence) !== undefined ? { at: timeOf(first.evidence)! } : {}) });
    }
    for (const bullet of bullets) {
      const key = bullet.text.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const at = timeOf(bullet.evidence);
      blocks.push({ ...bullet, kind: 'bullet', ...(at !== undefined ? { at } : {}) });
    }
  }
  // Keep important points omitted by a model's topic list, without repeating them.
  for (const bullet of notes.keyPoints) {
    if (seen.has(bullet.text.toLowerCase().trim())) continue;
    seen.add(bullet.text.toLowerCase().trim());
    const at = timeOf(bullet.evidence);
    insertAtTime(blocks, { ...bullet, kind: 'bullet', ...(at !== undefined ? { at } : {}) });
  }
  for (const image of [...(meeting.images ?? [])].sort((a, b) => a.at - b.at)) insertAtTime(blocks, imageBlock(image));
  return { ...notes, blocks };
}

/** Nearest preceding source, not an appendix. Stable when timestamps tie. */
function insertAtTime(blocks: NoteBlock[], block: NoteBlock) {
  let index = -1;
  let closest = -Infinity;
  for (let i = 0; i < blocks.length; i++) {
    const candidate = blocks[i]!;
    if (candidate.kind === 'heading' || candidate.at === undefined) continue;
    if (candidate.at <= (block.at ?? 0) && candidate.at >= closest) { index = i; closest = candidate.at; }
  }
  blocks.splice(index + 1, 0, block);
}

function imageBlock(image: MeetingImage): NoteBlock {
  return { id: `image-${image.id}`, kind: 'image', text: image.caption, imageId: image.id, at: image.at, evidence: [] };
}

export function insertMeetingImage(meeting: Meeting, image: MeetingImage): Meeting {
  if (meeting.images?.some((existing) => existing.id === image.id)) return meeting;
  image = { ...image, context: meetingImageContext(meeting, image.at) };
  const document = editableDocument(meeting);
  const blocks = [...document.blocks!];
  insertAtTime(blocks, imageBlock(image));
  return { ...meeting, images: [...(meeting.images ?? []), image], notes: { ...document, blocks } };
}

/** Source passage for a moment. Expanded mode grows the range, still from real events only. */
export function meetingImagePassage(meeting: Pick<Meeting, 'events'>, image: MeetingImage, expanded = false) {
  const context = image.context ?? meetingImageContext(meeting, image.at);
  if (!expanded) {
    const ids = new Set(context.eventIds);
    return meeting.events.filter((event) => ids.has(event.id));
  }
  const start = Math.max(0, context.startAt - 40_000);
  const end = context.endAt + 45_000;
  return meeting.events.filter((event) => event.isFinal && transcriptEventEnd(event) >= start && transcriptEventTime(event) <= end);
}

/** Regeneration preserves a hand-edited document in full, including deleted blocks and image placement. */
export function preserveDocument(next: NotesDocument, previous: NotesDocument): NotesDocument {
  return previous.blocks ? { ...next, blocks: previous.blocks } : next;
}

const uses = (evidence: Evidence[], id: string) => evidence.some((source) => source.eventIds.includes(id));

/** Preview is pure; nothing is written until the user accepts it. */
export function previewTranscriptCorrection(meeting: Meeting, eventId: string, text: string, correctedAt = new Date().toISOString()) {
  const event = meeting.events.find((e) => e.id === eventId);
  if (!event || !text.trim() || event.text === text.trim()) return { meeting, changes: [] as { before: string; after: string }[] };
  const updated = { ...event, text: text.trim(), originalText: event.originalText ?? event.text,
    corrections: [...(event.corrections ?? []), { text: text.trim(), correctedAt }] };
  const events = meeting.events.map((e) => e.id === eventId ? updated : e);
  const sourceRevision = (meeting.sourceRevision ?? 0) + 1;
  const rebuilt = refreshMeetingNotes({ ...meeting, events, sourceRevision, items: meeting.items.filter((i) => !uses(i.evidence, eventId)) });
  const oldDocument = editableDocument(meeting);
  const fresh = editableDocument({ ...rebuilt, notes: buildNotesDocument(rebuilt), images: [] });
  const affected = fresh.blocks!.filter((b) => uses(b.evidence, eventId));
  const changes: { before: string; after: string }[] = [];
  const generatedDocument = meeting.notes?.method === 'cloud' || meeting.notes?.method === 'on-device';
  let inserted = false;
  const blocks = oldDocument.blocks!.flatMap((block): NoteBlock[] => {
    if (!uses(block.evidence, eventId)) return [block];
    if (generatedDocument || block.userEdited) {
      changes.push({ before: block.text, after: generatedDocument && !block.userEdited
        ? 'Generated wording is kept and flagged until you refresh or review it.'
        : 'Your wording is kept and flagged for review.' });
      return [{ ...block, needsReview: true }];
    }
    if (inserted) { changes.push({ before: block.text, after: 'Merged into the corrected passage.' }); return []; }
    inserted = true;
    changes.push({ before: block.text, after: affected.map((b) => b.text).join('\n') || 'No longer extracted as a note.' });
    return affected;
  });
  if (!generatedDocument && !inserted && affected.length) for (const block of affected) insertAtTime(blocks, block);
  const protectedItems = meeting.items.filter((i) => uses(i.evidence, eventId) && (i.userEdited || i.completed || i.dismissed || i.confirmed));
  const freshItems = rebuilt.items.filter((i) => uses(i.evidence, eventId));
  for (const old of meeting.items.filter((i) => uses(i.evidence, eventId))) {
    changes.push({ before: old.title, after: protectedItems.includes(old) ? 'Your reviewed item is kept and flagged for review.' : freshItems.map((i) => `${i.title}${i.due ? ` · due ${i.due}` : ''}`).join('\n') || 'No longer extracted as an item.' });
  }
  // Protected items stay explicitly stale; a new interpretation never silently overwrites them.
  const items = protectedItems.length
    ? [...rebuilt.items.filter((i) => !uses(i.evidence, eventId)), ...protectedItems.map((i) => ({ ...i, confirmed: false, needsReview: true }))]
    : rebuilt.items;
  const images = meeting.images?.map((image) => {
    if (!image.context?.eventIds.includes(eventId)) return image;
    changes.push({ before: image.caption || `Captured moment at ${Math.round(image.at / 1000)}s`, after: 'Its nearby transcript context will be marked for review.' });
    return { ...image, needsReview: true };
  });
  const notes = generatedDocument ? { ...meeting.notes!, blocks } : { ...rebuilt.notes!, blocks };
  const nextMeeting = { ...rebuilt, sourceRevision, items, notes, ...(images ? { images } : {}) };
  delete nextMeeting.suggestedNotes;
  return { meeting: nextMeeting, changes };
}

export function safeImageUrl(url: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
}
