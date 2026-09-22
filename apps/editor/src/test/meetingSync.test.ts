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
