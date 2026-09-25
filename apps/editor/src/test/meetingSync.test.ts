import { afterEach, describe, expect, it } from 'vitest';
import {
  acceptsAcknowledgment, bridge, deleteMeeting, meetingMutation, mutateMeeting,
  preserveGeneratedConflict, reconcileMeetingUpdate,
} from '@excerpt/core';
import type { Meeting, MeetingMutationAcknowledgment, NotesDocument } from '@excerpt/types';
import { createFakeNativeHost, installFakeNativeHost } from './fakeNativeHost';

const empty: NotesDocument = {
  version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [],
};
const base: Meeting = {
  id: 'sync-meeting', title: 'Synthetic sync', startedAt: '2026-09-22T01:00:00Z',
  endedAt: '2026-09-22T01:30:00Z', processing: 'on-device', events: [], items: [],
  notes: empty, schemaVersion: 1, revision: 1, documentRevision: 0, sourceRevision: 0,
};

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

describe('native editor revision synchronization', () => {
  it('accepts automatic notes in an untouched open editor', () => {
    const generated: Meeting = {
      ...base, revision: 2, documentRevision: 1,
      notes: { ...empty, method: 'on-device', blocks: [{ id: 'generated', kind: 'paragraph', text: 'Automatic notes', evidence: [] }] },
    };
    expect(reconcileMeetingUpdate(generated, base, base, false).notes?.blocks?.[0]?.text)
      .toBe('Automatic notes');
  });

  it('keeps writing while generation is pending and retains the result for retry', () => {
    const local: Meeting = {
      ...base,
      notes: { ...empty, blocks: [{ id: 'mine', kind: 'paragraph', text: 'Writing during generation', evidence: [], userEdited: true }] },
    };
    const generated: Meeting = {
      ...base, revision: 2, documentRevision: 1,
      notes: {
        ...empty, method: 'on-device',
        generation: { provider: 'apple', model: 'fixture', generatedAt: '2026-09-22T02:00:00Z', sourceRevision: 0, style: 'balanced' },
        blocks: [{ id: 'generated', kind: 'paragraph', text: 'Automatic notes', evidence: [] }],
      },
    };
    const visible = reconcileMeetingUpdate(generated, base, local, true);
    expect(visible.notes?.blocks?.[0]?.text).toBe('Writing during generation');
    expect(preserveGeneratedConflict(generated, visible).suggestedNotes?.blocks?.[0]?.text)
      .toBe('Automatic notes');
  });

  it('ignores acknowledgments older than the latest native snapshot', () => {
    const newest = { ...base, revision: 9 };
    const old = { ...base, revision: 7 };
    const acknowledgment: MeetingMutationAcknowledgment = {
      operationId: 'old', meetingId: base.id, status: 'applied', revision: 7,
      documentRevision: 0, sourceRevision: 0, meeting: old,
    };
    expect(acceptsAcknowledgment(acknowledgment, newest)).toBe(false);
  });

  it('rehydrates compact native acknowledgments from known images', async () => {
    const image = { id: 'known', dataUrl: 'data:image/png;base64,c3ludGhldGlj',
      capturedAt: '2026-09-22T01:10:00Z', at: 1_000, caption: 'Old caption' };
    const original: Meeting = { ...base, images: [image] };
    const host = createFakeNativeHost({ meetings: [original] });
    const native = host.mutateMeeting.bind(host);
    host.mutateMeeting = async (mutation) => {
      const acknowledged = await native(mutation);
      return { ...acknowledged, imageDataOmitted: true, meeting: { ...acknowledged.meeting,
        images: (acknowledged.meeting.images ?? []).map((value) => ({ ...value, dataUrl: '' })) } };
    };
    restore = installFakeNativeHost(host);
    const next = { ...original, title: 'Renamed' };
    const mutation = meetingMutation(original, next)!;
    const hydrated = await mutateMeeting(mutation, original.images);
    expect(hydrated.meeting.images?.[0]?.dataUrl).toBe(image.dataUrl);
    expect(hydrated.meeting.title).toBe('Renamed');
    expect(host.calls).not.toContain(`loadMeeting:${base.id}`);
  });

  it('reloads instead of accepting an empty image when a compact reply has an unknown capture', async () => {
    const image = { id: 'unknown', dataUrl: 'data:image/png;base64,c3ludGhldGlj',
      capturedAt: '2026-09-22T01:10:00Z', at: 1_000, caption: 'Native capture' };
    const original: Meeting = { ...base, images: [image] };
    const host = createFakeNativeHost({ meetings: [original] });
    const native = host.mutateMeeting.bind(host);
    host.mutateMeeting = async (mutation) => {
      const acknowledged = await native(mutation);
      return { ...acknowledged, imageDataOmitted: true, meeting: { ...acknowledged.meeting,
        images: (acknowledged.meeting.images ?? []).map((value) => ({ ...value, dataUrl: '' })) } };
    };
    restore = installFakeNativeHost(host);
    const result = await mutateMeeting(meetingMutation(original, { ...original, title: 'Renamed' })!);
    expect(result.meeting.images?.[0]?.dataUrl).toBe(image.dataUrl);
    expect(host.calls).toContain(`loadMeeting:${base.id}`);
  });

  it('uses typed bridge operations for corrections review images captions and deleted blocks', async () => {
    const host = createFakeNativeHost({ meetings: [base] });
    restore = installFakeNativeHost(host);
    const event = {
      id: 'event', sessionId: base.id, role: 'remote' as const, speakerLabel: 'SPEAKER',
      text: 'Corrected source', isFinal: true, tArrived: 1_000,
      originalText: 'Original source', corrections: [{ text: 'Corrected source', correctedAt: '2026-09-22T02:00:00Z' }],
    };
    const image = {
      id: 'image', dataUrl: 'data:image/png;base64,c3ludGhldGlj',
      capturedAt: '2026-09-22T01:10:00Z', at: 600_000, caption: 'A caption' as string,
    };
    const changed: Meeting = {
      ...base, events: [event], sourceRevision: 1,
      items: [{ id: 'item', category: 'action', state: 'decided', title: 'Use it', evidence: [], assignee: 'you', salience: 1, confirmed: true, completed: true }],
      images: [image],
      notes: {
        ...empty,
        blocks: [{ id: 'image-image', kind: 'image', text: 'A caption', evidence: [], imageId: 'image' }],
        deletedBlocks: [{ id: 'removed', kind: 'paragraph', text: 'Removed', evidence: [] }],
      },
    };
    const operation = meetingMutation(base, changed)!;
    expect(operation.changes.map((change) => change.type)).toEqual(['correctTranscript']);
    const acknowledgment = await mutateMeeting(operation);
    expect(acknowledgment.status).toBe('applied');
    expect(acknowledgment.meeting.events[0]?.corrections).toHaveLength(1);
    expect(acknowledgment.meeting.items[0]?.confirmed).toBe(true);
    expect(acknowledgment.meeting.images?.[0]?.dataUrl).toBe(image.dataUrl);
    expect(acknowledgment.meeting.notes?.deletedBlocks?.[0]?.id).toBe('removed');
  });

  it('corrects transcript text without retransmitting an unchanged screenshot', async () => {
    const image = { id: 'existing', dataUrl: 'data:image/png;base64,c3ludGhldGlj',
      capturedAt: '2026-09-22T01:10:00Z', at: 600_000, caption: 'Screen' };
    const original: Meeting = { ...base, images: [image] };
    const corrected: Meeting = { ...original, sourceRevision: 1,
      events: [{ id: 'speech', sessionId: base.id, role: 'remote', speakerLabel: 'SPEAKER',
        text: 'Corrected words', isFinal: true, tArrived: 1000 }] };
    const mutation = meetingMutation(original, corrected)!;
    expect(mutation.changes[0]?.type).toBe('correctTranscript');
    expect(JSON.stringify(mutation)).not.toContain(image.dataUrl);
    const host = createFakeNativeHost({ meetings: [original] });
    restore = installFakeNativeHost(host);
    const reply = await mutateMeeting(mutation);
    expect(reply.meeting.images?.[0]?.dataUrl).toBe(image.dataUrl);
  });

  it('saves image placement and caption alongside image bytes', async () => {
    const host = createFakeNativeHost({ meetings: [base] });
    restore = installFakeNativeHost(host);
    const image = { id: 'new', dataUrl: 'data:image/png;base64,c3ludGhldGlj',
      capturedAt: '2026-09-22T01:10:00Z', at: 0, timeKnown: false, caption: 'Important slide', origin: 'import' as const };
    const next: Meeting = { ...base, images: [image], notes: { ...empty, blocks: [
      { id: 'written', kind: 'paragraph', text: 'My notes', evidence: [], userEdited: true },
      { id: 'image-new', kind: 'image', text: image.caption, imageId: image.id,
        evidence: [], placement: 'manual' },
    ] } };
    const mutation = meetingMutation(base, next)!;
    expect(mutation.changes.map((change) => change.type)).toEqual(['addImages', 'setDocument']);
    const saved = await mutateMeeting(mutation);
    expect(saved.meeting.images?.[0]?.timeKnown).toBe(false);
    expect(saved.meeting.images?.[0]?.caption).toBe('Important slide');
    expect(saved.meeting.notes?.blocks?.map((block) => block.id)).toEqual(['written', 'image-new']);
    const captioned: Meeting = { ...saved.meeting,
      images: [{ ...image, caption: 'Revised caption' }],
      notes: { ...saved.meeting.notes!, blocks: saved.meeting.notes!.blocks!.map((block) =>
        block.imageId === image.id ? { ...block, text: 'Revised caption', userEdited: true } : block) } };
    const captionMutation = meetingMutation(saved.meeting, captioned)!;
    expect(captionMutation.changes.map((change) => change.type)).toEqual(['updateImage', 'setDocument']);
    const captionSave = await mutateMeeting(captionMutation);
    expect(captionSave.meeting.images?.[0]?.caption).toBe('Revised caption');
    expect(captionSave.meeting.notes?.blocks?.[1]?.text).toBe('Revised caption');
    const placed: Meeting = { ...captionSave.meeting,
      images: [{ ...captionSave.meeting.images![0]!, anchorAt: 300_000, timeKnown: true }],
      notes: { ...captionSave.meeting.notes!, blocks: captionSave.meeting.notes!.blocks!.map((block) =>
        block.imageId === image.id ? { ...block, at: 300_000 } : block) } };
    const anchored = await mutateMeeting(meetingMutation(captionSave.meeting, placed)!);
    expect(anchored.meeting.images?.[0]?.at).toBe(0);
    expect(anchored.meeting.images?.[0]?.anchorAt).toBe(300_000);
    expect(anchored.meeting.notes?.blocks?.[1]?.at).toBe(300_000);
  });

  it('does not read unchanged image bytes when only document wording changes', () => {
    let reads = 0;
    const image = {
      id: 'large', capturedAt: '2026-09-22T01:10:00Z', at: 600_000, caption: 'Saved image',
      get dataUrl() { reads++; return 'data:image/png;base64,c3ludGhldGlj'; },
    };
    const before: Meeting = { ...base, images: [image] };
    const after: Meeting = { ...before, notes: { ...empty, blocks: [
      { id: 'writing', kind: 'paragraph', text: 'A corrected sentence', evidence: [], userEdited: true },
    ] } };
    expect(meetingMutation(before, after)?.changes.map((change) => change.type)).toEqual(['setDocument']);
    expect(reads).toBe(0);
  });

  it('propagates native deletion failures so the library can retain the entry', async () => {
    const host = createFakeNativeHost({ meetings: [base] });
    host.deleteMeeting = async () => { throw new Error('Synthetic durable delete failure'); };
    restore = installFakeNativeHost(host);
    await expect(deleteMeeting(base.id)).rejects.toThrow('Synthetic durable delete failure');
    expect(host.meetings.has(base.id)).toBe(true);
  });

  it('propagates native export failure and preserves cancellation as a distinct result', async () => {
    const host = createFakeNativeHost({ meetings: [base] });
    host.exportMarkdown = async () => { throw new Error('Synthetic export write failure'); };
    restore = installFakeNativeHost(host);
    await expect(bridge()!.exportMarkdown('notes.md', 'notes'))
      .rejects.toThrow('Synthetic export write failure');
    host.exportMarkdown = async () => 'cancelled';
    await expect(bridge()!.exportMarkdown('notes.md', 'notes')).resolves.toBe('cancelled');
  });
});
