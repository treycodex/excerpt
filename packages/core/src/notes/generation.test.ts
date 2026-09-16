import { describe, expect, it } from 'vitest';
import { boundTombstones } from './generation';
import type { Meeting, MeetingImage, NotesProviderStatus, TranscriptEvent } from '@excerpt/types';
import { compareNotesDocuments, mergeGeneratedNotes, notesCapability } from './generation';
import { editableDocument, insertMeetingImage, previewTranscriptCorrection } from './editor';
import { refreshMeetingNotes } from './summary';

const event = (id: string, text: string, at: number): TranscriptEvent => ({ id, text, tArrived: at, tStart: at / 1000, sessionId: 'm', isFinal: true, speakerLabel: 'YOU', role: 'you' });
const base = (): Meeting => refreshMeetingNotes({ id: 'm', title: 'Launch review', startedAt: '2026-09-07T09:00:00Z', processing: 'on-device',
  events: [event('a', "I'll send the revised deck by Thursday.", 10000), event('b', 'The customer onboarding flow needs fewer steps.', 60000)], items: [] });
const shot = (id: string, at: number): MeetingImage => ({ id, at, capturedAt: '2026-09-07T09:00:30Z', caption: '', dataUrl: 'data:image/png;base64,aGVsbG8=' });

const ready: NotesProviderStatus = { openAIKeyConfigured: false, selected: 'apple', ready: true, providerName: 'Apple Intelligence', processing: 'on-device' };

describe('what the notes toolbar is allowed to offer', () => {
  it('keeps a deletion across serialized reloads, repeated refreshes, and source correction', () => {
    const meeting = base();
    const original = editableDocument(meeting);
    const removed = original.blocks![0]!;
    let notes = JSON.parse(JSON.stringify({ ...original, blocks: original.blocks!.slice(1), deletedBlocks: [removed] }));
    for (let i = 0; i < 2; i++) {
      const generated = editableDocument(refreshMeetingNotes({ ...meeting, notes }));
      notes = mergeGeneratedNotes(notes, generated);
      expect(notes.blocks.map((b: { text: string }) => b.text)).not.toContain(removed.text);
      expect(notes.deletedBlocks).toEqual([removed]);
    }
    const corrected = previewTranscriptCorrection({ ...meeting, notes }, 'a', "I'll send the revised deck by Friday.").meeting;
    expect(corrected.notes!.blocks!.some((b) => b.evidence.some((e) => e.eventIds.includes('a')))).toBe(false);
    expect(corrected.notes!.deletedBlocks).toEqual([removed]);
  });

  it('does not mistake a deleted sibling or heading for all the notes in its source', () => {
    const evidence = [{ eventIds: ['shared'], quote: 'The client wants a shorter cut and a clearer end card.', tArrived: 0, speakerLabel: 'YOU' }];
    const heading = { id: 'h', kind: 'heading' as const, text: 'Client feedback', evidence };
    const cut = { id: 'a', kind: 'bullet' as const, text: 'The client wants a shorter cut.', evidence };
    const card = { id: 'b', kind: 'bullet' as const, text: 'The client wants a clearer end card.', evidence };
    const generated = { version: 1 as const, method: 'extractive' as const, keyPoints: [], topics: [], blocks: [heading, cut, card] };
    const current = { ...generated, blocks: [card], deletedBlocks: [heading, cut] };
    const merged = mergeGeneratedNotes(current, generated);
    expect(merged.blocks).toEqual([card]);
    expect(mergeGeneratedNotes({ ...generated, blocks: [], deletedBlocks: generated.blocks }, generated).blocks).toEqual([]);
    // Restoring the pre-deletion document (Undo) removes its tombstones too.
    expect(mergeGeneratedNotes(generated, generated).blocks).toEqual(generated.blocks);
  });

  it('keeps deletions while allowing new provider wording from a different source', () => {
    const original = editableDocument(base());
    const removed = original.blocks![0]!;
    const current = { ...original, blocks: original.blocks!.slice(1), deletedBlocks: [removed] };
    const extra = { ...removed, id: 'new', text: 'Budget approval is pending.', evidence: [{ eventIds: ['new'], quote: 'Budget approval is pending.', tArrived: 90000, speakerLabel: 'YOU' }] };
    const generated = { ...original, method: 'cloud' as const, blocks: [...original.blocks!, extra] };
    const merged = mergeGeneratedNotes(current, generated);
    expect(merged.blocks!.map((b) => b.text)).toEqual([original.blocks![1]!.text, extra.text]);
    expect(merged.deletedBlocks).toEqual([removed]);
  });
  it('offers a browser only the rebuild it can actually perform', () => {
    const capability = notesCapability({ isLiveDraft: false, hasTranscript: true, native: false });
    expect(capability.refresh).toBe(true);
    expect(capability.enhancements).toEqual([]);
    expect(capability.explanation).toContain('rebuild excerpts');
  });

  it('does not treat the presence of a bridge as a working provider', () => {
    const capability = notesCapability({ isLiveDraft: false, hasTranscript: true, native: true, hasProviderCall: true });
    expect(capability.enhancements).toEqual([]);
    expect(capability.refresh).toBe(true);
    expect(capability.settings).toBe(true);
  });

  it('offers the three styles only when the selected provider says it can be asked', () => {
    const capability = notesCapability({ isLiveDraft: false, hasTranscript: true, native: true, hasProviderCall: true, status: ready });
    expect(capability.enhancements.map((e) => e.style)).toEqual(['balanced', 'shorter', 'detailed']);
    expect(capability.explanation).toContain('Apple Intelligence');
  });

  it('names the cloud as the cloud rather than claiming every Mac summary is local', () => {
    const capability = notesCapability({ isLiveDraft: false, hasTranscript: true, native: true, hasProviderCall: true,
      status: { openAIKeyConfigured: true, selected: 'openai', ready: true, providerName: 'OpenAI gpt-5-mini', processing: 'cloud' } });
    expect(capability.explanation).toContain('sends your transcript to OpenAI gpt-5-mini');
    expect(capability.explanation).not.toContain('on this Mac');
  });

  it('will not send a transcript to a provider that has not said where it goes', () => {
    const capability = notesCapability({ isLiveDraft: false, hasTranscript: true, native: true, hasProviderCall: true,
      status: { openAIKeyConfigured: false, selected: 'apple', ready: true, providerName: 'Some provider' } });
    expect(capability.enhancements).toEqual([]);
    expect(capability.refresh).toBe(true);
    expect(capability.settings).toBe(true);
    expect(capability.explanation).toContain('did not say whether');
    expect(capability.explanation).not.toContain('runs on this Mac');
  });

  it('explains an unconfigured provider before a request rather than after one', () => {
    const capability = notesCapability({ isLiveDraft: false, hasTranscript: true, native: true, hasProviderCall: true,
      status: { openAIKeyConfigured: false, selected: 'openai', ready: false, reason: 'no-key', providerName: 'OpenAI gpt-5-mini', processing: 'cloud' } });
    expect(capability.enhancements).toEqual([]);
    expect(capability.refresh).toBe(true);
    expect(capability.settings).toBe(true);
    expect(capability.explanation).toContain('no API key is stored');
  });

  it('suggests no generation work on an empty meeting, and none during capture', () => {
    const empty = notesCapability({ isLiveDraft: false, hasTranscript: false, native: true, hasProviderCall: true, status: ready });
    expect(empty.refresh).toBe(false);
    expect(empty.enhancements).toEqual([]);
    expect(empty.explanation).toContain('Generated excerpts need transcript text');
    const live = notesCapability({ isLiveDraft: true, hasTranscript: true, native: true, hasProviderCall: true, status: ready });
    expect(live).toEqual({ refresh: false, enhancements: [], explanation: '', settings: false });
  });
});

describe('whether a finished result changed anything', () => {
  it('calls an unchanged rebuild unchanged, ignoring regenerated ids and times', () => {
    const meeting = base();
    const current = editableDocument(meeting);
    const rebuilt = editableDocument({ ...refreshMeetingNotes(meeting), images: [] });
    const candidate = mergeGeneratedNotes(current, rebuilt);
    expect(candidate.blocks!.map((b) => b.text)).toEqual(current.blocks!.map((b) => b.text));
    expect(compareNotesDocuments(current, candidate)).toBe('same');
  });

  it('separates a source-only change from new wording', () => {
    const current = editableDocument(base());
    const blocks = current.blocks!;
    const reworded = { ...current, blocks: blocks.map((b, i) => i === 0 ? { ...b, id: 'other', text: `${b.text} Also next week.` } : b) };
    expect(compareNotesDocuments(current, reworded)).toBe('wording');
    const resourced = { ...current, blocks: blocks.map((b, i) => i === 0 ? { ...b, id: 'other', at: 99, needsReview: true } : b) };
    expect(compareNotesDocuments(current, resourced)).toBe('metadata');
    const requoted = { ...current, blocks: blocks.map((b, i) => i === 0
      ? { ...b, evidence: b.evidence.map((e) => ({ ...e, quote: `${e.quote} extra` })) } : b) };
    expect(compareNotesDocuments(current, requoted)).toBe('metadata');
  });

  it('does not discard an evidence-only change as identical output', () => {
    const current = editableDocument(base());
    const rewired = { ...current, blocks: current.blocks!.map((b, i) => i === 0
      ? { ...b, evidence: b.evidence.map((e) => ({ ...e, eventIds: [...e.eventIds, 'c'] })) } : b) };
    expect(compareNotesDocuments(current, rewired)).not.toBe('same');
  });
});

describe('what a candidate may not touch', () => {
  it('keeps handwritten text, edited generated blocks, images and image positions', () => {
    const meeting = insertMeetingImage(base(), shot('s', 30000));
    const current = editableDocument(meeting);
    const written = {
      ...current,
      blocks: [
        { ...current.blocks![0]!, text: 'My own wording for this one.', userEdited: true },
        current.blocks![1]!,
        { id: 'mine', kind: 'paragraph' as const, text: 'A thought nobody said out loud.', evidence: [], userEdited: true },
        current.blocks![2]!,
      ],
    };
    const generated = { ...current, blocks: current.blocks!.filter((b) => b.kind !== 'image').map((b) => ({ ...b, id: `g-${b.id}`, text: `Rewritten: ${b.text}` })) };
    const merged = mergeGeneratedNotes(written, generated);

    expect(merged.blocks!.find((b) => b.id === 'mine')?.text).toBe('A thought nobody said out loud.');
    expect(merged.blocks!.find((b) => b.text === 'My own wording for this one.')).toBeTruthy();
    expect(merged.blocks!.filter((b) => b.kind === 'image').map((b) => b.imageId)).toEqual(['s']);
    // The image still sits exactly where the reader left it.
    expect(merged.blocks!.findIndex((b) => b.kind === 'image'))
      .toBe(written.blocks!.findIndex((b) => b.kind === 'image'));
    // The edited block's source is not also rewritten beside it.
    expect(merged.blocks!.filter((b) => b.text.startsWith('Rewritten:')).length)
      .toBe(generated.blocks!.length - 1);
  });

  /**
   * The regression that mattered. One transcript event yields several bullets, so the
   * blocks around an edited one cite the same event it does. Dropping every incoming
   * block that touched a protected block's sources left those siblings with nothing to
   * pair with, and they were deleted — from a preview that promised the opposite.
   */
  it('keeps the neighbours of an edited block when they quote the same sentence', () => {
    const shared = [{ eventIds: ['e5'], tArrived: 5000, quote: 'It loses people before the end card.', speakerLabel: 'YOU' }];
    const current = { version: 1 as const, method: 'extractive' as const, keyPoints: [], topics: [], blocks: [
      { id: 'one', kind: 'bullet' as const, text: 'They feel the second cut runs long (client flagged).', evidence: shared, userEdited: true },
      { id: 'two', kind: 'bullet' as const, text: 'It loses people before the end card.', evidence: shared },
    ] };
    const generated = { ...current, blocks: [
      { id: 'g1', kind: 'bullet' as const, text: 'They feel the second cut runs long.', evidence: shared },
      { id: 'g2', kind: 'bullet' as const, text: 'It loses people before the end card.', evidence: shared },
    ] };
    const merged = mergeGeneratedNotes(current, generated);
    expect(merged.blocks!.map((b) => b.text)).toEqual([
      'They feel the second cut runs long (client flagged).',
      'It loses people before the end card.',
    ]);
  });

  /**
   * The second regression. Pairing each block with the *first* incoming block sharing a
   * source is only correct while the document's order and the rebuild's order agree,
   * and the reader has two buttons whose whole job is to make them disagree. Moving a
   * bullet above its neighbour used to hand the neighbour's replacement to the wrong
   * block: one note vanished and a regenerated twin of the reader's own edited sentence
   * appeared beside it.
   */
  it('survives the reader reordering blocks that quote the same sentence', () => {
    const shared = [{ eventIds: ['e5'], tArrived: 5000, quote: 'Both bullets come from this one sentence.', speakerLabel: 'YOU' }];
    const mine = { id: 'a', kind: 'bullet' as const, text: 'They feel the second cut runs long (client flagged).', evidence: shared, userEdited: true };
    const moved = { id: 'b', kind: 'bullet' as const, text: 'It loses people before the end card.', evidence: shared };
    // The reader edited the first and then moved the second above it.
    const current = { version: 1 as const, method: 'extractive' as const, keyPoints: [], topics: [], blocks: [moved, mine] };
    const generated = { ...current, blocks: [
      { id: 'g1', kind: 'bullet' as const, text: 'They feel the second cut runs long.', evidence: shared },
      { id: 'g2', kind: 'bullet' as const, text: 'It loses people before the end card.', evidence: shared },
    ] };
    const merged = mergeGeneratedNotes(current, generated);
    expect(merged.blocks!.map((b) => b.text)).toEqual([
      'It loses people before the end card.',
      'They feel the second cut runs long (client flagged).',
    ]);
  });

  it('prefers the incoming block that cites the same sources over one that merely overlaps', () => {
    const a = { eventIds: ['a'], tArrived: 1000, quote: 'a', speakerLabel: 'YOU' };
    const b = { eventIds: ['b'], tArrived: 2000, quote: 'b', speakerLabel: 'YOU' };
    const current = { version: 1 as const, method: 'extractive' as const, keyPoints: [], topics: [], blocks: [
      { id: 'edited', kind: 'bullet' as const, text: 'My own line.', evidence: [b], userEdited: true },
      { id: 'both', kind: 'bullet' as const, text: 'Covers both moments.', evidence: [a, b] },
    ] };
    const generated = { ...current, blocks: [
      { id: 'g-both', kind: 'bullet' as const, text: 'Covers both moments, rewritten.', evidence: [a, b] },
      { id: 'g-b', kind: 'bullet' as const, text: 'Just the second moment.', evidence: [b] },
    ] };
    const merged = mergeGeneratedNotes(current, generated);
    expect(merged.blocks!.map((b) => b.text)).toEqual(['My own line.', 'Covers both moments, rewritten.']);
  });

  it('keeps a block the reader wrote that cites nothing, which nothing can be paired with', () => {
    const evidence = [{ eventIds: ['a'], tArrived: 1000, quote: 'a', speakerLabel: 'YOU' }];
    const orphan = { id: 'orphan', kind: 'paragraph' as const, text: 'A thought with no source.', evidence: [] };
    const current = { version: 1 as const, method: 'extractive' as const, keyPoints: [], topics: [], blocks: [
      orphan, { id: 'sourced', kind: 'bullet' as const, text: 'From the transcript.', evidence },
    ] };
    const generated = { ...current, blocks: [{ id: 'g', kind: 'bullet' as const, text: 'From the transcript, again.', evidence }] };
    expect(mergeGeneratedNotes(current, generated).blocks!.map((b) => b.text))
      .toEqual(['A thought with no source.', 'From the transcript, again.']);
  });

  it('does not delete a section when its heading is edited, or its heading when a bullet is', () => {
    const at = (id: string) => [{ eventIds: [id], tArrived: 1000, quote: id, speakerLabel: 'YOU' }];
    const blocks = [
      // A heading carries every source its section's bullets do.
      { id: 'h', kind: 'heading' as const, text: 'Budget', evidence: [...at('a'), ...at('b')] },
      { id: 'b1', kind: 'bullet' as const, text: 'First point.', evidence: at('a') },
      { id: 'b2', kind: 'bullet' as const, text: 'Second point.', evidence: at('b') },
    ];
    const document = { version: 1 as const, method: 'on-device' as const, keyPoints: [], topics: [], blocks };
    const generated = { ...document, blocks: blocks.map((b) => ({ ...b, id: `g-${b.id}`, text: `New ${b.text}` })) };

    const editedHeading = mergeGeneratedNotes(
      { ...document, blocks: [{ ...blocks[0]!, text: 'Budget and burn', userEdited: true }, blocks[1]!, blocks[2]!] },
      generated);
    expect(editedHeading.blocks!.map((b) => b.text)).toEqual(['Budget and burn', 'New First point.', 'New Second point.']);

    const editedBullet = mergeGeneratedNotes(
      { ...document, blocks: [blocks[0]!, { ...blocks[1]!, text: 'My first point.', userEdited: true }, blocks[2]!] },
      generated);
    expect(editedBullet.blocks!.map((b) => b.kind)).toEqual(['heading', 'bullet', 'bullet']);
    expect(editedBullet.blocks!.map((b) => b.text)).toEqual(['New Budget', 'My first point.', 'New Second point.']);
  });

  it('notices a provider rewrite that lands on the wording already there', () => {
    const blocks = [{ id: 'one', kind: 'bullet' as const, text: 'Ship on Friday.', evidence: [] }];
    const extractive = { version: 1 as const, method: 'extractive' as const, keyPoints: [], topics: [], blocks };
    const cloud = { ...extractive, method: 'cloud' as const, generation: {
      provider: 'openai' as const, model: 'gpt-5-mini', generatedAt: '2026-10-01T00:00:00Z', sourceRevision: 0, style: 'balanced' as const,
    } };
    expect(compareNotesDocuments(extractive, cloud)).toBe('metadata');
    expect(compareNotesDocuments(extractive, { ...extractive })).toBe('same');
  });

  it('drops nothing a protected block owns, and appends genuinely new wording', () => {
    const current = editableDocument(base());
    const extra = { id: 'new', kind: 'bullet' as const, text: 'A point from a passage nobody had a block for.', evidence: [{ eventIds: ['z'], tArrived: 90000, quote: 'z', speakerLabel: 'YOU' }] };
    const merged = mergeGeneratedNotes(current, { ...current, blocks: [...current.blocks!, extra] });
    expect(merged.blocks!.at(-1)!.text).toBe(extra.text);
    expect(compareNotesDocuments(current, merged)).toBe('wording');
  });
});

describe('tombstones do not grow without limit', () => {
  const block = (i: number) => ({ id: `b${i}`, kind: 'bullet' as const, text: `removed ${i}`, evidence: [] });

  it('keeps a normal document untouched', () => {
    const few = [block(1), block(2), block(3)];
    expect(boundTombstones(few)).toBe(few);
    expect(boundTombstones(undefined)).toEqual([]);
  });

  it('keeps the newest, which are the ones regeneration could restore', () => {
    // Every tombstone is a whole block with its evidence, saved with the meeting
    // forever; nothing pruned them.
    const many = Array.from({ length: 260 }, (_, i) => block(i));
    const kept = boundTombstones(many);
    expect(kept).toHaveLength(200);
    expect(kept.at(-1)!.id).toBe('b259');
    expect(kept[0]!.id).toBe('b60');
  });
});
