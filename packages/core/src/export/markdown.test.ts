import { describe, expect, it } from 'vitest';
import type { Item, Meeting } from '@excerpt/types';
import { toHTML, toMarkdown } from './markdown';

const evidence = [{ eventIds: ['e1'], tArrived: 1000, quote: 'I will send it.', speakerLabel: 'YOU' }];
const item = (patch: Partial<Item>): Item => ({
  id: 'i1', category: 'action', state: 'discussed', title: 'I will send it.',
  evidence, assignee: 'you', salience: 1, ...patch,
});

describe('Markdown export', () => {
  it('keeps UI order, decision counts, and edit provenance consistent', () => {
    const meeting: Meeting = {
      id: 'm1', title: 'Review', startedAt: '2026-09-10T00:00:00.000Z',
      processing: 'demo',
      events: [{ id: 'e1', sessionId: 's', role: 'you', speakerLabel: 'YOU', text: 'I will send it.', isFinal: true, tArrived: 1000 }],
      items: [
        item({ state: 'decided', userEdited: true }),
        item({ id: 'i2', category: 'decision', state: 'proposed', title: 'We could wait.' }),
      ],
    };

    const output = toMarkdown(meeting);
    expect(output).toContain('2 items · 0 decided');
    expect(output.indexOf('## Action items')).toBeLessThan(output.indexOf('## Decisions'));
    expect(output).toContain('_(edited)_');
  });

  it('exports the original wording and every correction in plain and rich copies', () => {
    const meeting: Meeting = {
      id: 'm1', title: 'Review', startedAt: '2026-09-10T00:00:00.000Z', processing: 'demo', items: [],
      events: [{ id: 'e1', sessionId: 's', role: 'you', speakerLabel: 'YOU', text: 'Ship Friday.', isFinal: true, tArrived: 1000,
        originalText: 'Ship Thursday.', corrections: [
          { text: 'Ship next week.', correctedAt: '2026-09-10T01:00:00Z' },
          { text: 'Ship Friday.', correctedAt: '2026-09-10T01:05:00Z' },
        ] }],
    };
    expect(toMarkdown(meeting)).toContain('Original: Ship Thursday.');
    expect(toMarkdown(meeting)).toContain('Corrected 2026-09-10T01:05:00Z: Ship Friday.');
    expect(toHTML(meeting)).toContain('Transcript and correction history');
    expect(toHTML(meeting)).toContain('Original: Ship Thursday.');
  });

  it('exports an imported image without inventing a meeting timestamp', () => {
    const meeting: Meeting = {
      id: 'm1', title: 'Review', startedAt: '2026-09-10T00:00:00.000Z',
      processing: 'on-device', events: [], items: [],
      images: [{ id: 'image', at: 0, timeKnown: false, capturedAt: '2026-09-10T02:00:00Z',
        caption: 'Slide', origin: 'import', dataUrl: 'data:image/png;base64,aGVsbG8=' }],
      notes: { version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [
        { id: 'image-image', kind: 'image', text: 'Slide', imageId: 'image', evidence: [] },
      ] },
    };
    expect(toMarkdown(meeting)).toContain('Time unknown · Screenshot');
    expect(toHTML(meeting)).toContain('Time unknown · Slide');
  });

  it('exports a previously duplicated durable block only once', () => {
    const text = 'Follow up on refinement planning.';
    const block = { id: 'written', kind: 'paragraph' as const, text, evidence: [], userEdited: true };
    const meeting: Meeting = {
      id: 'm1', title: 'Review', startedAt: '2026-09-10T00:00:00.000Z',
      processing: 'on-device', events: [], items: [],
      notes: { version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [block, { ...block }] },
    };
    expect(toMarkdown(meeting).split(text)).toHaveLength(2);
    expect(toHTML(meeting).split(text)).toHaveLength(2);
  });

  it('keeps every captured image and edited caption in one offline HTML file', () => {
    const png = 'data:image/png;base64,aGVsbG8=';
    const images = Array.from({ length: 30 }, (_, index) => ({
      id: `shot-${index}`, at: index * 180_000, capturedAt: '2026-09-10T00:00:00Z',
      caption: `Edited <caption> ${index}`, dataUrl: png,
    }));
    const meeting: Meeting = {
      id: 'heavy', title: 'Image-heavy meeting', startedAt: '2026-09-10T00:00:00Z',
      processing: 'on-device', events: [], items: [], images,
      notes: { version: 1, method: 'extractive', keyPoints: [], topics: [], blocks:
        images.map((image) => ({ id: `block-${image.id}`, kind: 'image', text: image.caption,
          imageId: image.id, evidence: [], at: image.at })) },
    };
    const html = toHTML(meeting);
    expect((html.match(/<img src="data:image\/png;base64,/g) ?? [])).toHaveLength(30);
    expect(html).toContain('Edited &lt;caption&gt; 29');
    expect(html).not.toContain('excerpt-asset:v1:');
    expect(html).toContain("img-src data:");
  });
});
