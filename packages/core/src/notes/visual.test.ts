import { describe, expect, it } from 'vitest';
import type { Evidence, Meeting, MeetingImage, NoteBlock, NotesDocument, TranscriptEvent } from '@excerpt/types';
import { insertMeetingImage } from './editor';
import { composeVisualNotes } from './visual';

const event = (id: string, at: number): TranscriptEvent => ({
  id, sessionId: 'm', role: 'you', speakerLabel: 'YOU', text: `We discussed the launch at ${at}.`,
  isFinal: true, tArrived: at, tStart: at / 1000,
});
const evidence = (id: string, at: number): Evidence => ({
  eventIds: [id], tArrived: at, tStart: at / 1000, quote: `We discussed the launch at ${at}.`, speakerLabel: 'YOU',
});
const text = (id: string, at: number): NoteBlock => ({
  id: `point-${id}`, kind: 'bullet', text: `Launch discussion at ${at}`, at, evidence: [evidence(id, at)],
});
const image = (id: string, at: number): MeetingImage => ({
  id, at, capturedAt: '2026-09-07T09:00:00Z', caption: id, origin: 'excerpt', dataUrl: 'data:image/png;base64,aGVsbG8=',
});
const empty: NotesDocument = { version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [] };
const base = (): Meeting => ({ id: 'm', title: 'Meeting', startedAt: '2026-09-07T09:00:00Z',
  processing: 'on-device', events: [event('first', 10_000), event('later', 120_000)], items: [], notes: empty });
const wording: NotesDocument = { ...empty, blocks: [text('first', 10_000), text('later', 120_000)] };

describe('automatic visual notes', () => {
  it('keeps captures with their own chronological passage when a subject returns later', () => {
    let meeting = base();
    meeting = insertMeetingImage(meeting, image('later-image', 121_000));
    meeting = insertMeetingImage(meeting, image('first-image', 11_000));
    const blocks = composeVisualNotes(meeting, wording).blocks!;
    expect(blocks.map((block) => block.imageId ?? block.id)).toEqual([
      'point-first', 'first-image', 'point-later', 'later-image',
    ]);
  });

  it('keeps two captures in one discussion in capture order', () => {
    let meeting = insertMeetingImage(base(), image('second', 13_000));
    meeting = insertMeetingImage(meeting, image('first', 11_000));
    const blocks = composeVisualNotes(meeting, wording).blocks!;
    expect(blocks.map((block) => block.imageId ?? block.id)).toEqual([
      'point-first', 'first', 'second', 'point-later',
    ]);
  });

  it('keeps a capture without compatible speech as its own moment', () => {
    const meeting = insertMeetingImage(base(), image('silent', 65_000));
    const blocks = composeVisualNotes(meeting, wording).blocks!;
    expect(blocks.map((block) => block.imageId ?? block.id)).toEqual(['point-first', 'silent', 'point-later']);
    expect(blocks[1]!.evidence).toEqual([]);
  });

  it('retains manual placement, handwritten text, captions, and intentional deletion', () => {
    let meeting = insertMeetingImage(insertMeetingImage(base(), image('moved', 11_000)), image('deleted', 12_000));
    const moved = meeting.notes!.blocks!.find((block) => block.imageId === 'moved')!;
    const removed = meeting.notes!.blocks!.find((block) => block.imageId === 'deleted')!;
    meeting = { ...meeting, notes: { ...meeting.notes!, blocks: [
      { ...moved, text: 'My caption', userEdited: true, placement: 'manual' },
      { id: 'writing', kind: 'paragraph', text: 'My own notes', evidence: [], userEdited: true },
    ], deletedBlocks: [removed] } };
    const blocks = composeVisualNotes(meeting, wording).blocks!;
    expect(blocks[0]!.imageId).toBe('moved');
    expect(blocks[0]!.text).toBe('My caption');
    expect(blocks[1]!.text).toBe('My own notes');
    expect(blocks.filter((block) => block.imageId === 'deleted')).toEqual([]);
  });

  it('keeps screenshot-only meetings useful and does not duplicate images on recomposition', () => {
    const meeting = insertMeetingImage({ ...base(), events: [] }, image('only', 30_000));
    const first = composeVisualNotes(meeting, empty);
    const second = composeVisualNotes({ ...meeting, notes: first }, empty);
    expect(second.blocks!.filter((block) => block.imageId === 'only')).toHaveLength(1);
  });

  it('leaves an empty meeting empty instead of inventing a section', () => {
    expect(composeVisualNotes({ ...base(), events: [] }, empty).blocks).toEqual([]);
  });

  it('keeps an imported image with unknown meeting time separate from transcript claims', () => {
    const meeting = insertMeetingImage(base(), { ...image('imported', 0), origin: 'import', timeKnown: false });
    const blocks = composeVisualNotes(meeting, wording).blocks!;
    const imported = blocks.find((block) => block.imageId === 'imported')!;
    expect(imported.at).toBeUndefined();
    expect(imported.evidence).toEqual([]);
    expect(blocks.at(-1)).toEqual(imported);
  });
  it('uses a corrected anchor without changing the original capture time', () => {
    const imageAtStart = { ...image('anchored', 0), anchorAt: 121_000 };
    const meeting = insertMeetingImage(base(), imageAtStart);
    const blocks = composeVisualNotes(meeting, wording).blocks!;
    expect(meeting.images?.[0]?.at).toBe(0);
    expect(blocks.map((block) => block.imageId ?? block.id)).toEqual([
      'point-first', 'point-later', 'anchored',
    ]);
    expect(blocks.at(-1)?.at).toBe(121_000);
  });
});
