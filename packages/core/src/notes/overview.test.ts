import { describe, expect, it } from 'vitest';
import type { Evidence, Item, Meeting, NotesDocument } from '@excerpt/types';
import { documentSummary, nextSteps } from './overview';
import { editableDocument } from './editor';
import { buildNotesDocument } from './summary';
import { toHTML, toMarkdown } from '../export/markdown';

const evidence = (id: string, t: number, quote = `Said at ${t}.`): Evidence[] =>
  [{ eventIds: [id], tArrived: t, quote, speakerLabel: 'SPEAKER' }];
const item = (patch: Partial<Item> & Pick<Item, 'id'>): Item => ({
  category: 'action', state: 'discussed', title: 'Send the revised deck.', evidence: evidence(patch.id, 1000),
  assignee: 'unassigned', salience: 1, ...patch,
});

describe('document summary', () => {
  const document: NotesDocument = {
    version: 1, method: 'extractive', topics: [],
    keyPoints: [
      { id: 'a', text: 'We approved the launch plan.', evidence: evidence('e1', 1000) },
      { id: 'b', text: 'Unsupported model sentence.', evidence: [] },
      { id: 'c', text: 'Pricing moves to the annual tier.', evidence: evidence('e2', 2000) },
      { id: 'd', text: 'Deleted by the reader.', evidence: evidence('e3', 3000) },
      { id: 'e', text: 'Support needs the new FAQ.', evidence: evidence('e4', 4000) },
      { id: 'f', text: 'A fourth supported point.', evidence: evidence('e5', 5000) },
    ],
    blocks: [
      { id: 'a', kind: 'bullet', text: 'We approved the launch plan for October.', evidence: evidence('e1', 1000), userEdited: true },
      { id: 'c', kind: 'bullet', text: 'Pricing moves to the annual tier.', evidence: evidence('e2', 2000) },
    ],
    deletedBlocks: [{ id: 'd', kind: 'bullet', text: 'Deleted by the reader.', evidence: evidence('e3', 3000) }],
  };

  it('uses the reader’s current wording, skips unsupported and deleted points, and stays short', () => {
    const summary = documentSummary(document);
    expect(summary.map((line) => line.text)).toEqual([
      'We approved the launch plan for October.',
      'Pricing moves to the annual tier.',
      'Support needs the new FAQ.',
    ]);
    expect(summary.every((line) => line.evidence.length > 0)).toBe(true);
  });

  it('is empty rather than invented when nothing is supported', () => {
    expect(documentSummary({ version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [] })).toEqual([]);
    const meeting: Meeting = { id: 'm', title: 'Quiet', startedAt: '2026-09-01T09:00:00Z', processing: 'on-device', events: [], items: [] };
    expect(documentSummary(editableDocument({ ...meeting, notes: buildNotesDocument(meeting) }))).toEqual([]);
  });

  it('follows the visible topic bullet when a deduplicated key point has a different id', () => {
    const original = 'We approved the October launch plan today.';
    const meeting: Meeting = {
      id: 'm', title: 'Launch', startedAt: '2026-09-01T09:00:00Z', processing: 'on-device',
      events: [{ id: 'e1', sessionId: 's', role: 'remote', speakerLabel: 'SPEAKER', text: original, isFinal: true, tArrived: 1000 }],
      items: [item({ id: 'decision', category: 'decision', state: 'decided', title: original, evidence: evidence('e1', 1000) })],
    };
    const document = editableDocument(meeting);
    expect(document.keyPoints[0]!.id).toBe('point-decision');
    expect(document.blocks!.map((block) => block.id)).toEqual(['point-e1-0']);

    const edited: NotesDocument = { ...document, blocks: [{ ...document.blocks![0]!, text: 'We approved the October launch plan.', userEdited: true }] };
    expect(documentSummary(edited).map((line) => line.text)).toEqual(['We approved the October launch plan.']);
    expect(toMarkdown({ ...meeting, notes: edited })).toContain('## Notes\n\n- We approved the October launch plan.');
    expect(toHTML({ ...meeting, notes: edited })).toContain('<p class="bullet" style="margin-left:0px">We approved the October launch plan.</p>');

    const removed: NotesDocument = { ...edited, blocks: [], deletedBlocks: [...edited.blocks!] };
    expect(documentSummary(removed)).toEqual([]);
    expect(toMarkdown({ ...meeting, notes: removed })).not.toContain('## Summary');
    expect(toHTML({ ...meeting, notes: removed })).not.toContain('<h2>Summary</h2>');
  });
});

describe('next steps', () => {
  it('returns the same item records chronologically, excluding dismissed and non-step categories', () => {
    const later = item({ id: 'later', evidence: evidence('e9', 9000) });
    const earlier = item({ id: 'earlier', category: 'deadline', due: '2026-10-01', evidence: evidence('e1', 1000) });
    const items = [later, item({ id: 'gone', dismissed: true }), item({ id: 'decision', category: 'decision' }), earlier];
    const steps = nextSteps(items);
    expect(steps.map((step) => step.id)).toEqual(['earlier', 'later']);
    expect(steps[0]).toBe(earlier);
    expect(steps[1]).toBe(later);
  });

  it('never assigns an owner the item does not already carry', () => {
    const steps = nextSteps([item({ id: 'x', assignee: 'unassigned' })]);
    expect(steps[0]!.assignee).toBe('unassigned');
  });
});

describe('exports reflect the document overview', () => {
  const meeting: Meeting = {
    id: 'm1', title: 'Overview', startedAt: '2026-09-10T00:00:00.000Z', processing: 'on-device',
    events: [{ id: 'e1', sessionId: 's', role: 'remote', speakerLabel: 'SPEAKER', text: 'We approved the launch plan.', isFinal: true, tArrived: 1000 }],
    items: [item({ id: 'done', completed: true, assignee: 'you', title: 'Send the revised deck.' })],
    notes: { version: 1, method: 'extractive', topics: [],
      keyPoints: [{ id: 'k', text: 'We approved the launch plan.', evidence: evidence('e1', 1000) }],
      blocks: [{ id: 'k', kind: 'bullet', text: 'We approved the launch plan.', evidence: evidence('e1', 1000) }] },
  };

  it('exports the visible notes after the transcript without the retired overview', () => {
    const markdown = toMarkdown(meeting);
    expect(markdown.indexOf('## Transcript')).toBeLessThan(markdown.indexOf('## Notes'));
    expect(markdown).not.toContain('## Action items');
    const html = toHTML(meeting);
    expect(html).toContain('<h2 id="notes">Notes</h2>');
    expect(html).toContain('href="#passage-e1"');
    expect(html).not.toContain('Assigned to you');
  });
});
