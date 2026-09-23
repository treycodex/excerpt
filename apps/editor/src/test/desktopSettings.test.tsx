import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { DesktopSettings, Meeting } from '@excerpt/types';
import { bridge } from '@excerpt/core';
import { DesktopPreferences } from '../views/DesktopPreferences';
import { Library } from '../views/Library';
import { Notes } from '../views/Notes';
import { createFakeNativeHost, installFakeNativeHost } from './fakeNativeHost';

let renderer: ReactTestRenderer;
let restore: (() => void) | undefined;
let events: EventTarget;
beforeEach(() => { events = new EventTarget(); vi.stubGlobal('window', events); });
afterEach(() => { if (renderer) act(() => renderer.unmount()); restore?.(); vi.unstubAllGlobals(); });
const change = async (label: string, value: string) => {
  await act(async () => { renderer.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }); });
};
const publish = (settings: DesktopSettings) => {
  const event = new Event('excerpt:desktop-settings');
  Object.assign(event, { detail: settings });
  act(() => { events.dispatchEvent(event); });
};
const text = () => JSON.stringify(renderer.toJSON());
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('native desktop settings in the real Preferences component', () => {
  it('loads native settings, writes only the changed field, and reloads acknowledged values', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    const save = vi.spyOn(host, 'saveCaptionSettings');
    await act(async () => { renderer = create(<DesktopPreferences />); });
    expect(renderer.root.findByProps({ 'aria-label': 'Caption look' }).props.value).toBe('classic');
    await change('Caption look', 'warm');
    await change('Caption size', 'large');
    await change('Caption position', 'higher');
    await change('Caption display', 'display-1');
    expect(save.mock.calls).toEqual([[{ preset: 'warm' }], [{ size: 'large' }], [{ position: 'higher' }], [{ displayId: 'display-1' }]]);
    await act(async () => { renderer.root.findByType('input').props.onChange({ target: { checked: false } }); });
    await act(async () => { renderer.unmount(); renderer = create(<DesktopPreferences />); });
    expect(renderer.root.findByProps({ 'aria-label': 'Caption look' }).props.value).toBe('warm');
    expect(renderer.root.findByType('input').props.checked).toBe(false);
    expect(text()).toContain('screen sharing');
  });

  it('receives menu updates, disconnect feedback, capture lock and shortcut conflicts', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<DesktopPreferences />); });
    const snapshot = await host.loadDesktopSettings();
    snapshot.captions.preset = 'contrast'; snapshot.captions.displayMissing = true;
    snapshot.microphone = { ...snapshot.microphone, devices: [], health: 'missing', message: 'USB input disconnected', selectionLocked: true };
    snapshot.shortcuts[0]!.registered = false;
    publish(snapshot);
    expect(renderer.root.findByProps({ 'aria-label': 'Caption look' }).props.value).toBe('contrast');
    expect(text()).toContain('USB input disconnected');
    expect(text()).toContain('Unavailable — use the Excerpt menu');
    expect(text()).toContain('until your selected display reconnects');
    expect(renderer.root.findAllByType('fieldset')[1]!.props.disabled).toBe(true);
  });

  it('does not let an old load or save acknowledgment overwrite a newer native event', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    const original = await host.loadDesktopSettings();
    const loading = deferred<DesktopSettings>(); host.loadDesktopSettings = () => loading.promise;
    await act(async () => { renderer = create(<DesktopPreferences />); });
    publish({ ...original, captions: { ...original.captions, preset: 'contrast' } });
    await act(async () => { loading.resolve(original); });
    expect(renderer.root.findByProps({ 'aria-label': 'Caption look' }).props.value).toBe('contrast');
    const saving = deferred<DesktopSettings>(); host.saveCaptionSettings = () => saving.promise;
    await change('Caption look', 'warm');
    publish({ ...original, captions: { ...original.captions, preset: 'contrast', size: 'large' } });
    await act(async () => { saving.resolve({ ...original, captions: { ...original.captions, preset: 'warm' } }); });
    expect(renderer.root.findByProps({ 'aria-label': 'Caption look' }).props.value).toBe('contrast');
    expect(renderer.root.findByProps({ 'aria-label': 'Caption size' }).props.value).toBe('large');
  });

  it('retains acknowledged controls when a save fails and permits retry', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<DesktopPreferences />); });
    vi.spyOn(host, 'saveCaptionSettings').mockRejectedValueOnce(new Error('Could not save captions'));
    await change('Caption look', 'warm');
    expect(text()).toContain('Could not save captions');
    expect(renderer.root.findByProps({ 'aria-label': 'Caption look' }).props.value).toBe('classic');
    await change('Caption look', 'warm');
    expect(renderer.root.findByProps({ 'aria-label': 'Caption look' }).props.value).toBe('warm');
    await change('Selected microphone', 'mic-1');
    expect(host.calls).toContain('selectMicrophone:mic-1');
  });

  it('shows a load failure and removes its native event listener on unmount', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    const remove = vi.spyOn(events, 'removeEventListener');
    host.loadDesktopSettings = async () => { throw new Error('Settings unavailable'); };
    await act(async () => { renderer = create(<DesktopPreferences />); });
    expect(text()).toContain('Settings unavailable');
    act(() => renderer.unmount());
    expect(remove).toHaveBeenCalledWith('excerpt:desktop-settings', expect.any(Function));
  });
});

describe('library native actions', () => {
  it('starts through the bridge without opening live notes and shows actionable failures', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<Library onOpen={() => {}} onStart={() => bridge()!.startMeeting()} onOpenLiveNotes={() => bridge()!.openLiveNotes()} />); });
    const button = (label: string) => renderer.root.findAllByType('button').find((node) => node.children.includes(label))!;
    await act(async () => { button('Start meeting').props.onClick(); });
    expect(host.calls).toContain('startMeeting'); expect(host.calls).not.toContain('openLiveNotes');
    host.startMeeting = async () => { throw new Error('Reconnect your selected microphone.'); };
    await act(async () => { button('Start meeting').props.onClick(); });
    expect(text()).toContain('Reconnect your selected microphone.');
    await act(async () => { button('Open live notes').props.onClick(); });
    expect(host.calls).toContain('openLiveNotes');
  });

  it('preserves and renders old demo meetings as legacy data', async () => {
    const legacy: Meeting = { id: 'legacy', title: 'Old meeting', processing: 'demo', startedAt: '2026-09-01T09:00:00Z', events: [], items: [] };
    const host = createFakeNativeHost({ meetings: [legacy] }); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<Library onOpen={() => {}} onStart={host.startMeeting} onOpenLiveNotes={host.openLiveNotes} />); });
    expect(text()).toContain('Legacy'); expect(host.meetings.get('legacy')!.processing).toBe('demo');
  });

  it('distinguishes unavailable storage from an empty library and keeps a refused rename visible', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    host.listMeetings = async () => { throw new Error('Storage unavailable'); };
    await act(async () => { renderer = create(<Library onOpen={() => {}} onStart={host.startMeeting} onOpenLiveNotes={host.openLiveNotes} />); });
    expect(text()).toContain('meeting storage could not be read');
    expect(text()).not.toContain('Nothing yet');
    host.listMeetings = async () => [...host.meetings.values()];
    host.meetings.set('rename-fixture', { id: 'rename-fixture', title: 'Original', startedAt: '2026-09-01T09:00:00Z', processing: 'on-device', events: [], items: [] });
    await act(async () => { renderer.unmount(); renderer = create(<Library onOpen={() => {}} onStart={host.startMeeting} onOpenLiveNotes={host.openLiveNotes} />); });
    await act(async () => { renderer.root.findAllByType('button').find((node) => node.children.includes('Rename'))!.props.onClick(); });
    host.mutateMeeting = async () => { throw new Error('Rename write refused'); };
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Meeting title' }).props.onChange({ target: { value: 'New title' } }); });
    await act(async () => { renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    expect(text()).toContain('Rename write refused');
    expect(renderer.root.findByProps({ 'aria-label': 'Meeting title' }).props.value).toBe('New title');
  });
});

describe('meeting document navigation', () => {
  it('keeps the document primary and makes transcript and detailed review reversible', async () => {
    const meeting: Meeting = {
      id: 'document-nav', title: 'Document navigation', processing: 'on-device',
      startedAt: '2026-09-01T09:00:00Z', endedAt: '2026-09-01T09:05:00Z', events: [], items: [],
      notes: { version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [] },
    };
    const host = createFakeNativeHost({ meetings: [meeting] }); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<Notes meeting={meeting} />); });
    const button = (label: string) => renderer.root.findAllByType('button').find((node) => node.children.some((child) => typeof child === 'string' && child.includes(label)))!;
    expect(text()).toContain('View transcript');
    expect(text()).toContain('Review extracted items');
    expect(renderer.root.findAllByType('details').some((node) => node.props.className === 'toolbar-menu')).toBe(true);
    await act(async () => { button('View transcript').props.onClick(); });
    expect(text()).toContain('Back to notes');
    await act(async () => { button('Back to notes').props.onClick(); });
    expect(text()).toContain('No decisions or action items found. Your transcript and screenshots are saved.');
  });

  it('offers a bounded undo after accepting new wording', async () => {
    const evidence = [{ eventIds: ['event-1'], tArrived: 1000, quote: 'We approved the revised plan.', speakerLabel: 'SPEAKER' }];
    const oldNotes: NonNullable<Meeting['notes']> = { version: 1, method: 'extractive', keyPoints: [], topics: [],
      blocks: [{ id: 'old', kind: 'bullet', text: 'The plan was approved.', evidence }] };
    const meeting: Meeting = {
      id: 'undo-fixture', title: 'Wording undo', processing: 'on-device',
      startedAt: '2026-09-01T09:00:00Z', endedAt: '2026-09-01T09:05:00Z',
      events: [{ id: 'event-1', sessionId: 'undo-fixture', role: 'remote', speakerLabel: 'SPEAKER', text: evidence[0]!.quote, isFinal: true, tArrived: 1000 }], items: [],
      notes: oldNotes,
      suggestedNotes: { ...oldNotes, method: 'on-device', blocks: [{ id: 'new', kind: 'bullet', text: 'The revised plan was approved.', evidence }] },
    };
    const host = createFakeNativeHost({ meetings: [meeting] }); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<Notes meeting={meeting} />); });
    const button = (label: string) => renderer.root.findAllByType('button').find((node) => node.children.includes(label))!;
    await act(async () => { button('Use this wording').props.onClick(); });
    expect(text()).toContain('Undo rewrite');
    await act(async () => { button('Undo rewrite').props.onClick(); });
    expect(text()).toContain('Previous wording restored.');
    expect(text()).not.toContain('Undo rewrite');
    expect(host.meetings.get('undo-fixture')?.notes?.blocks?.[0]?.text).toBe('The plan was approved.');
  });
});
