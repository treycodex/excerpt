import { afterEach, describe, expect, it } from 'vitest';
import type { Meeting } from '@excerpt/types';
import { deleteMeeting, loadMeeting, saveMeeting } from '@excerpt/core';
import { createFakeNativeHost, installFakeNativeHost } from './fakeNativeHost';

const meeting: Meeting = {
  id: 'fixture-editor-host', title: 'Synthetic editor host', startedAt: '2026-09-01T09:00:00Z',
  processing: 'on-device', events: [], items: [],
};

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

describe('explicit fake native host', () => {
  it('exposes Start and Open live notes only through the native bridge', async () => {
    const host = createFakeNativeHost();
    restore = installFakeNativeHost(host);
    await host.startMeeting();
    await host.openLiveNotes();
    expect(host.calls).toEqual(['startMeeting', 'openLiveNotes']);
  });

  it('drives the production storage client without browser persistence', async () => {
    const host = createFakeNativeHost({ meetings: [meeting] });
    restore = installFakeNativeHost(host);

    expect((await loadMeeting(meeting.id))?.title).toBe(meeting.title);
    const edited = { ...meeting, title: 'Saved by fake native host' };
    const saved = await saveMeeting(edited);
    expect(saved?.title).toBe(edited.title);
    expect((await loadMeeting(meeting.id))?.title).toBe(edited.title);
    await deleteMeeting(meeting.id);

    expect(host.calls).toEqual([
      'loadMeeting:fixture-editor-host', 'loadMeeting:fixture-editor-host',
      'mutateMeeting:fixture-editor-host',
      'loadMeeting:fixture-editor-host', 'deleteMeeting:fixture-editor-host',
    ]);
    expect(host.meetings.has(meeting.id)).toBe(false);
  });
});
