import { describe, expect, it } from 'vitest';
import type { Meeting, MeetingImage, TranscriptEvent } from '@excerpt/types';
import { editableDocument, insertMeetingImage, previewTranscriptCorrection } from './editor';
import { refreshMeetingNotes } from './summary';
import { toHTML, toMarkdown } from '../export/markdown';

const event = (id: string, text: string, at: number): TranscriptEvent => ({ id, text, tArrived: at, tStart: at / 1000, sessionId: 'm', isFinal: true, speakerLabel: 'YOU', role: 'you' });
const base = (): Meeting => refreshMeetingNotes({ id: 'm', title: 'Launch review', startedAt: '2026-09-07T09:00:00Z', processing: 'on-device',
  events: [event('a', "I'll send the revised deck by Thursday.", 10000), event('b', 'The customer onboarding flow needs fewer steps.', 60000)], items: [] });
const shot = (id: string, at: number): MeetingImage => ({ id, at, capturedAt: '2026-09-07T09:00:30Z', caption: '', dataUrl: 'data:image/png;base64,aGVsbG8=' });

describe('editable notes and meeting screenshots', () => {
  it('places a screenshot between the surrounding discussion, and keeps its capture time', () => {
    const input = insertMeetingImage(base(), shot('s', 30000));
    const blocks = input.notes!.blocks!;
    expect(blocks.map((b) => b.kind)).toEqual(['bullet', 'image', 'bullet']);
    expect(blocks[1]!.at).toBe(30000);
    expect(editableDocument(JSON.parse(JSON.stringify(input)))).toEqual(input.notes);
  });
  it('keeps multiple screenshots in timestamp order even when imported out of order', () => {
    const input = insertMeetingImage(insertMeetingImage(base(), shot('later', 40000)), shot('earlier', 30000));
    expect(input.notes!.blocks!.filter((b) => b.kind === 'image').map((b) => b.imageId)).toEqual(['earlier', 'later']);
  });
  it('handles screenshots before speech and screenshots without any speech', () => {
    const input = insertMeetingImage(base(), shot('early', 0));
    expect(input.notes!.blocks![0]!.kind).toBe('image');
    const silent = insertMeetingImage({ ...base(), events: [], items: [], notes: { version: 1, method: 'extractive', keyPoints: [], topics: [] } }, shot('silent', 100));
    expect(silent.notes!.blocks).toHaveLength(1);
  });
  it('does not restore a removed image or deleted text when opening a saved document', () => {
    const input = insertMeetingImage(base(), shot('s', 30000));
    input.notes!.blocks = [];
    expect(editableDocument(input).blocks).toEqual([]);
  });
  it('never inserts the same capture twice', () => {
    const input = insertMeetingImage(base(), shot('s', 30000));
    expect(insertMeetingImage(input, shot('s', 30000))).toBe(input);
  });
  it('previews a corrected deadline without mutating the original meeting', () => {
    const original = base();
    const preview = previewTranscriptCorrection(original, 'a', "I'll send the revised deck by Friday.", '2026-09-07T10:00:00Z');
    expect(original.events[0]!.text).toContain('Thursday');
    expect(original.events[0]!.originalText).toBeUndefined();
    expect(preview.meeting.events[0]!.originalText).toContain('Thursday');
    expect(preview.meeting.items.find((i) => i.category === 'action')!.due).toBe('2026-09-11');
    expect(preview.meeting.notes!.blocks![0]!.text).toContain('Friday');
    expect(preview.changes.length).toBeGreaterThan(0);
  });
  it('retains an audit trail across repeated corrections', () => {
    const first = previewTranscriptCorrection(base(), 'a', "I'll send the revised deck by Friday.").meeting;
    const second = previewTranscriptCorrection(first, 'a', "I'll send the revised deck by Monday.").meeting;
    expect(second.events[0]!.originalText).toContain('Thursday');
    expect(second.events[0]!.corrections).toHaveLength(2);
  });
  it('preserves manually edited text, reviewed commitments, and screenshot placement on correction', () => {
    const input = insertMeetingImage(base(), shot('s', 30000));
    input.notes!.blocks![0] = { ...input.notes!.blocks![0]!, text: 'My carefully worded note', userEdited: true };
    input.items[0] = { ...input.items[0]!, confirmed: true, completed: true };
    const next = previewTranscriptCorrection(input, 'a', "I'll send the revised deck by Friday.").meeting;
    expect(next.notes!.blocks![0]!.text).toBe('My carefully worded note');
    expect(next.notes!.blocks![0]!.needsReview).toBe(true);
    expect(next.items.find((i) => i.completed)!.needsReview).toBe(true);
    expect(next.items.find((i) => i.completed)!.confirmed).toBe(false);
    expect(next.images).toEqual(input.images);
  });
  it('does not treat a source citation as permission to execute HTML in the portable export', () => {
    const input = insertMeetingImage(base(), shot('s', 30000));
    input.title = '<script>alert(1)</script>';
    input.notes!.blocks![0]!.text = '<img src=x onerror=alert(1)>';
    const html = toHTML(input);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('data:image/png;base64,aGVsbG8=');
    expect(html).toContain('0:30');
    expect(toMarkdown(input)).toContain('Screenshot');
  });
});
