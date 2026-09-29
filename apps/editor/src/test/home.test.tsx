import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { DesktopSettings, Meeting } from '@excerpt/types';
import { Home, elapsed } from '../views/Home';
import { createFakeNativeHost, installFakeNativeHost } from './fakeNativeHost';

let renderer: ReactTestRenderer;
let restore: (() => void) | undefined;
let events: EventTarget;
beforeEach(() => { events = new EventTarget(); vi.stubGlobal('window', events); });
afterEach(() => { if (renderer) act(() => renderer.unmount()); restore?.(); vi.unstubAllGlobals(); });
const text = () => JSON.stringify(renderer.toJSON());
type Node = ReactTestRenderer['root'];
const words = (node: Node | string): string => typeof node === 'string' ? node : node.children.map(words).join('');
const button = (label: string) => renderer.root.findAllByType('button').find((node) => words(node).includes(label))!;
const publish = (settings: DesktopSettings) => {
  const event = new Event('excerpt:desktop-settings');
  Object.assign(event, { detail: settings });
  act(() => { events.dispatchEvent(event); });
};

describe('home command center', () => {
  it('starts a named meeting, then offers End once native reports it live', async () => {
    const saved: Meeting = { id: 'm-1', title: 'Design crit', processing: 'on-device', startedAt: '2026-09-01T09:00:00Z', endedAt: '2026-09-01T09:30:00Z', events: [], items: [] };
    const host = createFakeNativeHost({ meetings: [saved] }); restore = installFakeNativeHost(host);
    const opened: string[] = [];
    await act(async () => { renderer = create(<Home onOpen={(id) => opened.push(id)} />); });
    expect(text()).toContain('Ready when ');
    expect(text()).toContain('you are.');
    expect(text()).toContain('⌘⇧R');
    expect(text()).toContain('Design crit');

    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Meeting name' }).props.onChange({ target: { value: ' Weekly sync ' } }); });
    await act(async () => { renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    expect(host.calls).toContain('startMeeting:Weekly sync');

    publish(await host.loadDesktopSettings());
    expect(text()).toContain('Weekly sync');
    expect(text()).toContain('Live · 0:0');
    await act(async () => { button('End meeting').props.onClick(); });
    expect(host.calls).toContain('endMeeting');

    await act(async () => { button('Design crit').props.onClick(); });
    expect(opened).toEqual(['m-1']);
  });

  it('switches captions and meeting noticing through native', async () => {
    const host = createFakeNativeHost(); restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<Home onOpen={() => {}} />); });
    const switches = () => renderer.root.findAllByProps({ role: 'switch' });
    expect(switches().map((s) => s.props['aria-checked'])).toEqual([true, true]);
    await act(async () => { switches()[0]!.props.onClick(); });
    await act(async () => { switches()[1]!.props.onClick(); });
    expect(host.calls).toContain('saveCaptionSettings');
    expect(host.calls).toContain('setNoticeMeetings:false');
    expect(switches().map((s) => s.props['aria-checked'])).toEqual([false, false]);
    expect(text()).toContain('Your meetings will appear here.');
  });

  it('counts the clock the way a meeting app does', () => {
    expect(elapsed(4_000)).toBe('0:04');
    expect(elapsed(247_000)).toBe('4:07');
    expect(elapsed(3_727_000)).toBe('1:02:07');
    expect(elapsed(-50)).toBe('0:00');
  });
});
