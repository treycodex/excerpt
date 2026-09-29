import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { Meeting } from '@excerpt/types';
import { NotesWorkspace } from '../views/NotesWorkspace';
import { createFakeNativeHost, installFakeNativeHost } from './fakeNativeHost';

let renderer: ReactTestRenderer;
let restore: (() => void) | undefined;
let events: EventTarget;
beforeEach(() => { events = new EventTarget(); vi.stubGlobal('window', events); });
afterEach(() => { if (renderer) act(() => renderer.unmount()); restore?.(); vi.unstubAllGlobals(); });
const text = () => JSON.stringify(renderer.toJSON());
const push = async (meeting: Meeting) => {
  const event = new Event('excerpt:meeting');
  Object.assign(event, { detail: meeting });
  await act(async () => { events.dispatchEvent(event); });
};

describe('meeting library sidebar', () => {
  it('stops calling a meeting live once native reports it ended, without navigating', async () => {
    const live: Meeting = {
      id: 'm-live', title: 'Launch review', processing: 'on-device', startedAt: '2026-09-29T20:51:00Z',
      draftRevision: 3, events: [], items: [],
    };
    const host = createFakeNativeHost({ meetings: [live] }); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<NotesWorkspace currentId="m-live"><p>page</p></NotesWorkspace>); });
    expect(text()).toContain('Live');

    const ended = { ...host.meetings.get('m-live')!, endedAt: '2026-09-29T20:56:00Z' };
    host.meetings.set('m-live', ended);
    await push(ended);
    expect(text()).not.toContain('Live');
    expect(text()).toContain('Transcript');
  });
});
