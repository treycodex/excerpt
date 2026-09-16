import { describe, expect, it } from 'vitest';
import type { Item } from '@excerpt/types';
import { relateItems } from './relate';

let n = 0;
const item = (over: Partial<Item> & { title: string; at: number }): Item => ({
  id: `i${n++}`, category: 'action', state: 'decided', assignee: 'unassigned',
  salience: 2, evidence: [{ eventIds: [`e${n}`], tArrived: over.at, quote: over.title, speakerLabel: 'SPEAKER' }],
  ...over,
});

describe('a request and the commitment that answers it', () => {
  it('offers the pair the exact de-duplication cannot reach', () => {
    // Different category values on every field the `unique` pass compares.
    const request = item({ title: 'Can you send the client the revised deck before Friday?', at: 0 });
    const commitment = item({ title: "I'll take the revised deck and get it over by Thursday.", at: 60_000, assignee: 'you' });
    const [relation] = relateItems([request, commitment]);
    expect(relation?.kind).toBe('request-commitment');
    expect(relation?.itemId).toBe(commitment.id);
    expect(relation?.relatedId).toBe(request.id);
    expect(relation?.shared).toContain('deck');
  });

  it('points from the commitment back to the request, never the reverse', () => {
    const request = item({ title: 'Can somebody redo the media plan numbers?', at: 0 });
    const commitment = item({ title: "I'll redo the media plan numbers tonight.", at: 30_000, assignee: 'you' });
    const [relation] = relateItems([request, commitment]);
    expect(relation!.itemId).toBe(commitment.id);
  });

  it('offers nothing when the two share only common words', () => {
    const a = item({ title: 'Can you send that over?', at: 0 });
    const b = item({ title: "I'll send that over.", at: 20_000, assignee: 'you' });
    expect(relateItems([a, b])).toEqual([]);
  });

  it('treats a plural and its singular as the same subject', () => {
    const a = item({ title: 'Can you refresh the campaign dashboards?', at: 0 });
    const b = item({ title: "I'll refresh the campaign dashboard tonight.", at: 20_000, assignee: 'you' });
    expect(relateItems([a, b])[0]?.kind).toBe('request-commitment');
  });

  it('does not connect two mentions an hour apart', () => {
    // The same words returned to much later is a topic, not a thread.
    const a = item({ title: 'Can you send the client the revised deck?', at: 0 });
    const b = item({ title: "I'll send the client the revised deck.", at: 70 * 60_000, assignee: 'you' });
    expect(relateItems([a, b])).toEqual([]);
  });
});

describe('a proposal and the decision that settles it', () => {
  it('offers the pair', () => {
    const proposal = item({ title: 'What if we moved the campaign launch to October?', at: 0,
      category: 'decision', state: 'proposed' });
    const decision = item({ title: "Let's move the campaign launch to October.", at: 40_000,
      category: 'decision', state: 'decided' });
    const [relation] = relateItems([proposal, decision]);
    expect(relation?.kind).toBe('proposal-decision');
    expect(relation?.itemId).toBe(decision.id);
  });

  it('does not pair two proposals, or two decisions', () => {
    const one = item({ title: 'We could move the campaign launch to October.', at: 0, category: 'decision', state: 'proposed' });
    const two = item({ title: 'We could move the campaign launch to November.', at: 20_000, category: 'decision', state: 'proposed' });
    expect(relateItems([one, two])).toEqual([]);
  });
});

describe('what relating never does', () => {
  it('stops asking once the reader has said they are not the same thing', () => {
    const request = item({ title: 'Can you send the revised deck before Friday?', at: 0 });
    const commitment = item({ title: "I'll send the revised deck Thursday.", at: 30_000, assignee: 'you' });
    expect(relateItems([request, commitment])).toHaveLength(1);
    expect(relateItems([request, { ...commitment, unrelated: [request.id] }])).toEqual([]);
  });

  it('honours a rejection recorded on either item', () => {
    // A rejection is a statement about the pair, not about whichever of the two
    // happened to be the one offered.
    const request = item({ title: 'Can you send the revised deck before Friday?', at: 0 });
    const commitment = item({ title: "I'll send the revised deck Thursday.", at: 30_000, assignee: 'you' });
    expect(relateItems([{ ...request, unrelated: [commitment.id] }, commitment])).toEqual([]);
  });

  it('keeps asking about an item whose title was merely corrected', () => {
    // Editing a title says nothing about whether this is the same commitment as
    // another. Conflating the two silenced the question for good.
    const request = item({ title: 'Can you send the revised deck before Friday?', at: 0 });
    const commitment = item({ title: "I'll send the revised deck Thursday.", at: 30_000, assignee: 'you', userEdited: true });
    expect(relateItems([request, commitment])).toHaveLength(1);
  });

  it('ignores dismissed items', () => {
    const request = item({ title: 'Can you send the revised deck before Friday?', at: 0, dismissed: true });
    const commitment = item({ title: "I'll send the revised deck Thursday.", at: 30_000, assignee: 'you' });
    expect(relateItems([request, commitment])).toEqual([]);
  });

  it('asks at most one question about any one item', () => {
    const first = item({ title: 'Can you send the revised client deck?', at: 0 });
    const second = item({ title: 'Can somebody send the revised client deck?', at: 10_000 });
    const commitment = item({ title: "I'll send the revised client deck.", at: 30_000, assignee: 'you' });
    expect(relateItems([first, second, commitment]).filter((r) => r.itemId === commitment.id)).toHaveLength(1);
  });

  it('returns suggestions only, and mutates nothing', () => {
    const request = item({ title: 'Can you send the client the revised deck?', at: 0 });
    const commitment = item({ title: "I'll send the client the revised deck.", at: 30_000, assignee: 'you' });
    const before = JSON.stringify([request, commitment]);
    relateItems([request, commitment]);
    expect(JSON.stringify([request, commitment])).toBe(before);
  });
});
