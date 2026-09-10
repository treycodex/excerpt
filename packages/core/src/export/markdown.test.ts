import { describe, expect, it } from 'vitest';
import type { Item, Meeting } from '@excerpt/types';
import { toMarkdown } from './markdown';

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
});
