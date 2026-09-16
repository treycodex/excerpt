import { describe, expect, it } from 'vitest';
import type { Meeting, TranscriptEvent } from '@excerpt/types';
import { meetingNoteCount, searchMeetings } from './search';

const event = (id: string, text: string): TranscriptEvent =>
  ({ id, text, tArrived: 0, isFinal: true, role: 'you', speakerLabel: 'YOU', sessionId: 's' });

const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: 'm', title: 'Meeting · Sep 10, 2026', startedAt: '2026-09-10T09:00:00Z',
  processing: 'on-device', events: [], items: [], ...over,
});

describe('finding a meeting without remembering its name', () => {
  it('finds a phrase that only ever appears in the transcript', () => {
    // The case the old title-only search could never answer, on a title nobody chose.
    const m = meeting({ events: [event('a', 'We agreed the pricing tiers stay as they are.')] });
    const [match] = searchMeetings([m], 'pricing tiers');
    expect(match?.kind).toBe('transcript');
    expect(match?.eventId).toBe('a');
    expect(match?.snippet).toContain('pricing tiers');
  });

  it('finds a phrase that only appears in an image caption', () => {
    const m = meeting({ images: [{ id: 'i1', dataUrl: 'data:,', capturedAt: '', at: 0, caption: 'The retail pack hero frame' }] });
    expect(searchMeetings([m], 'retail pack')[0]?.kind).toBe('moment');
  });

  it('finds writing in the notes document', () => {
    const m = meeting({ notes: { version: 1, method: 'extractive', keyPoints: [], topics: [],
      blocks: [{ id: 'b', kind: 'paragraph', text: 'Ask legal about the endorsement wording.', evidence: [] }] } });
    expect(searchMeetings([m], 'endorsement')[0]?.kind).toBe('note');
  });

  it('prefers the title, then writing, over a transcript mention', () => {
    const m = meeting({ title: 'Pricing review', events: [event('a', 'pricing again')] });
    expect(searchMeetings([m], 'pricing')[0]?.kind).toBe('title');
  });

  it('keeps the library order rather than ranking by where the match landed', () => {
    // Newest first is what the reader wants; a title hit in an old meeting should
    // not jump ahead of a transcript hit in this morning's.
    const recent = meeting({ id: 'new', events: [event('a', 'the launch budget')] });
    const old = meeting({ id: 'old', title: 'Launch budget' });
    expect(searchMeetings([recent, old], 'launch budget').map((m) => m.meeting.id)).toEqual(['new', 'old']);
  });

  it('ignores accents and case so a name still matches', () => {
    const m = meeting({ events: [event('a', 'Ask Ángela to re-cut the radio edit.')] });
    expect(searchMeetings([m], 'angela')[0]?.kind).toBe('transcript');
  });

  it('marks the match inside the snippet it returns', () => {
    const m = meeting({ events: [event('a', 'The completion rate on the hero film is up eleven points against the benchmark.')] });
    const [match] = searchMeetings([m], 'hero film');
    expect(match!.snippet.slice(match!.offset, match!.offset + match!.length).toLowerCase()).toBe('hero film');
  });

  it('returns nothing for an empty or whitespace query', () => {
    const m = meeting({ events: [event('a', 'anything')] });
    expect(searchMeetings([m], '')).toEqual([]);
    expect(searchMeetings([m], '   ')).toEqual([]);
  });

  it('skips interim speech, which is volatile and never saved', () => {
    const interim = { ...event('a', 'provisional wording'), isFinal: false };
    expect(searchMeetings([meeting({ events: [interim] })], 'provisional')).toEqual([]);
  });
});

describe('what the sidebar calls a note', () => {
  it('counts what somebody wrote, not what the extractor found', () => {
    // A meeting written into at length used to read "0 notes" because no decision
    // was extracted from it.
    const m = meeting({ items: [], notes: { version: 1, method: 'extractive', keyPoints: [], topics: [],
      blocks: [
        { id: '1', kind: 'heading', text: 'Client feedback', evidence: [] },
        { id: '2', kind: 'bullet', text: 'The second cut runs long.', evidence: [] },
        { id: '3', kind: 'image', text: '', evidence: [], imageId: 'i1' },
      ] } });
    expect(meetingNoteCount(m)).toBe(3);
  });

  it('falls back to extracted items when nothing has been written yet', () => {
    const m = meeting({ items: [{ id: 'i', category: 'decision', state: 'decided', title: 'x',
      evidence: [], assignee: 'unassigned', salience: 2 }] });
    expect(meetingNoteCount(m)).toBe(1);
  });

  it('does not count an empty block as writing', () => {
    const m = meeting({ notes: { version: 1, method: 'extractive', keyPoints: [], topics: [],
      blocks: [{ id: '1', kind: 'paragraph', text: '   ', evidence: [] }] } });
    expect(meetingNoteCount(m)).toBe(0);
  });
});
