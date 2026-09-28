import { describe, expect, it } from 'vitest';
import type { Meeting, MeetingImage, TranscriptEvent } from '@excerpt/types';
import { transcriptTimeline } from './timeline';
import { hasSmartNotes, previewTranscriptCorrection } from '../notes/editor';
import { toHTML, toMarkdown } from '../export/markdown';
const event = (id: string, at: number): TranscriptEvent => ({ id, sessionId: 'm', role: 'remote', speakerLabel: 'SPEAKER', text: `Passage ${id}.`, isFinal: true, tArrived: at + 3000, tStart: at / 1000 });
const image = (id: string, at: number): MeetingImage => ({ id, at, caption: `Image ${id}`, capturedAt: '2026-09-28T10:00:00Z', dataUrl: 'data:image/png;base64,aGVsbG8=' });
const meeting = (patch: Partial<Meeting> = {}): Meeting => ({ id: 'm', title: "Trey's meeting", processing: 'on-device', startedAt: '2026-09-28T10:00:00Z', events: [event('a', 0), event('b', 5000)], items: [], ...patch });

describe('the transcript timeline', () => {
  it('splits a continuous speaker turn at captures, uses corrected anchors, and leaves unknown times at the end', () => {
    const events = [event('b', 5000), { ...event('interim', 1000), isFinal: false }, event('a', 0)];
    const images = [{ ...image('unknown', 0), timeKnown: false }, { ...image('anchored', 9000), anchorAt: 2000 }, image('after', 10000)];
    const entries = transcriptTimeline(events, images);
    expect(entries.map((entry) => entry.kind === 'turn' ? entry.turn.events.map((e) => e.id).join(',') : entry.image.id)).toEqual(['a', 'anchored', 'b', 'after', 'unknown']);
    expect(images[0]!.id).toBe('unknown');
    expect(events[0]!.id).toBe('b');
  });

  it('exports the same capture order once, optional notes afterwards, and usable source links', () => {
    const m = meeting({ images: [image('middle', 2000)], notes: { version: 1, method: 'on-device', keyPoints: [], topics: [], blocks: [
      { id: 'written', kind: 'paragraph', text: 'A shorter account.', evidence: [{ eventIds: ['a'], tArrived: 3000, quote: 'Passage a.', speakerLabel: 'SPEAKER' }] },
      { id: 'shot', kind: 'image', imageId: 'middle', text: 'Image middle', evidence: [] },
    ] } });
    const html = toHTML(m), md = toMarkdown(m);
    expect(html.indexOf('Passage a.')).toBeLessThan(html.indexOf('<figure>'));
    expect(html.indexOf('<figure>')).toBeLessThan(html.indexOf('Passage b.'));
    expect(html.indexOf('Passage b.')).toBeLessThan(html.indexOf('A shorter account.'));
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(md.match(/!\[/g)).toHaveLength(1);
    expect(html).toContain('href="#passage-a"');
    expect(html).toContain('id="passage-a"');
    expect(html).toContain('Trey&#39;s meeting');
    expect(html).not.toContain('undefined');
  });

  it('keeps captures and handwritten notes without running extraction during a correction', () => {
    const m = meeting({ images: [image('middle', 2000)], notes: { version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [
      { id: 'mine', kind: 'paragraph', text: 'My own reminder.', evidence: [], userEdited: true },
    ] } });
    const next = previewTranscriptCorrection(m, 'a', 'We decided the launch is Friday.').meeting;
    expect(next.items).toEqual([]);
    expect(next.notes).toEqual(m.notes);
    expect(next.events[0]!.originalText).toBe('Passage a.');
    expect(next.images).toEqual(m.images);
    expect(hasSmartNotes(meeting({ images: [image('only', 0)] }))).toBe(false);
  });
});
