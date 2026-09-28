import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { Evidence, Item, Meeting } from '@excerpt/types';
import { App } from '../App';
import { Library } from '../views/Library';
import { Notes } from '../views/Notes';
import { NotesWorkspace } from '../views/NotesWorkspace';
import { createFakeNativeHost, installFakeNativeHost } from './fakeNativeHost';
import type { FakeNativeHost } from './fakeNativeHost';

/**
 * Phase 6 document journey against the real Notes component and a synthetic,
 * in-memory native host. No DOM is available here, so the few browser globals the
 * return-to-position logic reads are stubbed explicitly and asserted on.
 */
class FakeElement {
  isConnected = true;
  dataset: Record<string, string> = {};
  focus = vi.fn();
}

let renderer: ReactTestRenderer;
let restore: (() => void) | undefined;
let windowStub: EventTarget & { scrollY: number; scrollTo: ReturnType<typeof vi.fn>; location: { hash: string; pathname: string } };
let documentStub: { activeElement: FakeElement | null; querySelector: ReturnType<typeof vi.fn> };

beforeEach(() => {
  windowStub = Object.assign(new EventTarget(), {
    scrollY: 0, scrollTo: vi.fn(), location: { hash: '', pathname: '/' },
  });
  documentStub = { activeElement: null, querySelector: vi.fn(() => null) };
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => { run(); return 0; });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); restore?.(); vi.unstubAllGlobals(); });

const nodeMock = () => ({ focus: vi.fn(), scrollIntoView: vi.fn(), setSelectionRange: vi.fn(), style: {}, scrollHeight: 0 });
const text = () => JSON.stringify(renderer.toJSON());
const content = (node: ReactTestInstance): string => node.children.map((child) => typeof child === 'string' ? child : content(child)).join('');
const button = (label: string, within: ReactTestInstance = renderer.root) =>
  within.findAll((node) => node.type === 'button' && (content(node).includes(label) || String(node.props['aria-label'] ?? '').includes(label)))[0]!;
const click = async (label: string, within?: ReactTestInstance) => {
  await act(async () => { button(label, within).props.onClick(); });
};

const quote = (id: string, t: number, words: string): Evidence[] => [{ eventIds: [id], tArrived: t, quote: words, speakerLabel: 'SPEAKER', tStart: t / 1000 }];
const events: Meeting['events'] = [
  { id: 'e1', sessionId: 'journey', role: 'remote', speakerLabel: 'SPEAKER', text: 'We approved the October launch plan.', isFinal: true, tArrived: 1000, tStart: 1 },
  { id: 'e2', sessionId: 'journey', role: 'you', speakerLabel: 'YOU', text: 'I will send the revised deck.', isFinal: true, tArrived: 5000, tStart: 5 },
  { id: 'e3', sessionId: 'journey', role: 'remote', speakerLabel: 'SPEAKER', text: 'Someone should update the pricing page.', isFinal: true, tArrived: 9000, tStart: 9 },
];
const action = (patch: Partial<Item> & Pick<Item, 'id'>): Item => ({
  category: 'action', state: 'discussed', title: 'I will send the revised deck.', evidence: quote('e2', 5000, events[1]!.text),
  assignee: 'you', salience: 1, ...patch,
});
const png = 'data:image/png;base64,aGVsbG8=';

function fixture(): Meeting {
  return {
    id: 'journey', title: 'Launch sync', processing: 'on-device',
    startedAt: '2026-09-01T09:00:00Z', endedAt: '2026-09-01T09:20:00Z', events,
    items: [
      action({ id: 'deck' }),
      action({ id: 'pricing', title: 'Someone should update the pricing page.', assignee: 'unassigned', evidence: quote('e3', 9000, events[2]!.text) }),
      { id: 'launch', category: 'decision', state: 'decided', title: 'We approved the October launch plan.', evidence: quote('e1', 1000, events[0]!.text), assignee: 'unassigned', salience: 2 },
    ],
    images: [
      { id: 'slide', dataUrl: png, capturedAt: '2026-09-01T09:00:03Z', at: 3000, caption: 'Launch timeline slide', origin: 'excerpt' },
      { id: 'later', dataUrl: png, capturedAt: '2026-09-01T09:10:00Z', at: 0, timeKnown: false, caption: 'Imported chart', origin: 'import' },
    ],
    notes: {
      version: 1, method: 'extractive', topics: [],
      keyPoints: [{ id: 'point-launch', text: 'We approved the October launch plan.', evidence: quote('e1', 1000, events[0]!.text) }],
      blocks: [
        { id: 'point-launch', kind: 'bullet', text: 'We approved the October launch plan.', evidence: quote('e1', 1000, events[0]!.text), at: 1000 },
        { id: 'image-slide', kind: 'image', text: 'Launch timeline slide', imageId: 'slide', evidence: [], at: 3000, placement: 'automatic' },
        { id: 'deck-line', kind: 'bullet', text: 'Revised deck is coming.', evidence: quote('e2', 5000, events[1]!.text), at: 5000 },
        { id: 'image-later', kind: 'image', text: 'Imported chart', imageId: 'later', evidence: [], placement: 'manual' },
      ],
    },
  };
}

/** A fixture with no notes, as a meeting is saved before anyone asks for them. */
function unwritten(patch: Partial<Meeting> = {}): Meeting {
  const { notes: _notes, ...meeting } = fixture();
  return { ...meeting, items: [], ...patch };
}

async function open(meeting = fixture()): Promise<FakeNativeHost> {
  const host = createFakeNativeHost({ meetings: [meeting] });
  restore = installFakeNativeHost(host);
  await act(async () => { renderer = create(<Notes meeting={host.meetings.get(meeting.id)!} />, { createNodeMock: nodeMock }); });
  return host;
}
describe('transcript first', () => {
  it('opens the chronological transcript without requesting notes', async () => {
    const host = await open();
    expect(renderer.root.findByProps({ 'aria-label': 'Meeting transcript' }).props.hidden).toBe(false);
    expect(host.calls.some((call) => call.startsWith('retryAutomaticNotes'))).toBe(false);
    const timeline = renderer.root.findByProps({ 'aria-label': 'Meeting transcript' });
    const sequence = timeline.findAll((node) => node.type === 'article' || node.type === 'figure').map(content);
    expect(sequence[0]).toContain('October launch');
    expect(sequence[1]).toContain('Launch timeline slide');
    expect(sequence[2]).toContain('revised deck');
    expect(sequence.at(-1)).toContain('Time unknown');
    expect(timeline.findAllByType('img')).toHaveLength(2);
    expect(text()).not.toContain('Review extracted items');
  });

  it('requires an explicit request and keeps the transcript accessible while notes are queued', async () => {
    const meeting = unwritten();
    const host = await open(meeting);
    await click('Notes');
    expect(text()).toContain('Written on this Mac with Apple Intelligence.');
    await click('Write notes');
    expect(host.calls.filter((call) => call === 'retryAutomaticNotes:journey')).toHaveLength(1);
    expect(text()).toContain('Writing your notes…');
    await click('Transcript');
    expect(renderer.root.findByProps({ 'aria-label': 'Meeting transcript' }).props.hidden).toBe(false);
    expect(text()).toContain('Writing notes in the background');
  });

  it('shows the cloud destination before writing and preserves the transcript after failure', async () => {
    const meeting = unwritten();
    const host = createFakeNativeHost({ meetings: [meeting] });
    host.getNotesProviderStatus = async () => ({ openAIKeyConfigured: true, selected: 'openai', ready: true, processing: 'cloud', providerName: 'OpenAI' });
    host.retryAutomaticNotes = async () => { throw new Error('Could not queue notes.'); };
    restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<Notes meeting={meeting} />, { createNodeMock: nodeMock }); });
    await click('Notes');
    expect(text()).toContain('Transcript text and screenshot captions are sent to OpenAI');
    await click('Write notes');
    expect(text()).toContain('Could not queue notes.');
    expect(host.meetings.get('journey')!.events).toEqual(events);
    expect(button('Write notes').props.disabled).toBe(false);
  });

  it('allows a blank handwritten document during a live meeting without generating notes', async () => {
    const host = await open((({ endedAt: _endedAt, ...live }) => live)(unwritten({ draftRevision: 0 })));
    await click('Notes');
    expect(renderer.root.findAllByType('button').some((node) => content(node) === 'Write notes')).toBe(false);
    await click('Write my own');
    const paragraph = renderer.root.findByProps({ 'aria-label': 'Paragraph' });
    expect(paragraph.props.value).toBe('');
    expect(host.meetings.get('journey')!.notes!.blocks).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.type === 'textarea')).toHaveLength(1);
    await act(async () => { paragraph.props.onChange({ target: { value: 'Ask about the budget.' } }); });
    expect(host.meetings.get('journey')!.notes!.blocks!.some((block) => block.text === 'Ask about the budget.')).toBe(true);
    expect(host.calls.some((call) => call.startsWith('retryAutomaticNotes'))).toBe(false);
  });

  it('corrects a transcript without creating notes or review items', async () => {
    const host = await open(unwritten());
    await click('Correct');
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Corrected transcript' }).props.onChange({ target: { value: 'We approved the November launch plan.' } }); });
    await click('Save correction');
    const saved = host.meetings.get('journey')!;
    expect(saved.events[0]!.originalText).toBe(events[0]!.text);
    expect(saved.items).toEqual([]);
    expect(saved.notes).toBeUndefined();
  });

  it('reports export cancellation on the transcript without changing views', async () => {
    const host = await open();
    host.exportMarkdown = async () => 'cancelled';
    await click('Save Markdown');
    expect(text()).toContain('Markdown export cancelled.');
    expect(renderer.root.findByProps({ 'aria-label': 'Meeting transcript' }).props.hidden).toBe(false);
  });
});

describe('source and correction trips return to the reader’s place', () => {
  it('restores scroll position and focus after a source panel, transcript correction, and close', async () => {
    const host = await open();
    await click('Notes');
    const opener = new FakeElement();
    documentStub.activeElement = opener; windowStub.scrollY = 640;
    await click('Show the 1 source passage for this note');
    expect(text()).toContain('Source passages for this note');

    const openInTranscript = new FakeElement();
    documentStub.activeElement = openInTranscript; windowStub.scrollY = 120;
    await click('Open in transcript');
    expect(text()).toContain('Back to the note you were checking');

    // Correct the line inline, beside the words being corrected.
    const line = renderer.root.findAll((node) => node.type === 'p' && String(node.props.className).startsWith('line-row') && content(node).includes('revised deck'))[0]!;
    await click('Correct', line);
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Corrected transcript' }).props.onChange({ target: { value: 'I will send the revised launch deck.' } }); });
    await click('Save correction');
    expect(host.meetings.get('journey')!.events.find((event) => event.id === 'e2')!.text).toBe('I will send the revised launch deck.');
    expect(host.meetings.get('journey')!.events.find((event) => event.id === 'e2')!.originalText).toBe('I will send the revised deck.');
    expect(text()).toContain('Correction saved.');

    windowStub.scrollTo.mockClear();
    await click('Back to the note you were checking');
    expect(windowStub.scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: 'auto' });
    expect(openInTranscript.focus).toHaveBeenCalledWith({ preventScroll: true });

    await click('Close source passages');
    expect(text()).not.toContain('Source passages for this note');
    expect(windowStub.scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: 'auto' });
    expect(opener.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('closes a captured moment with Escape and returns to the image that opened it', async () => {
    await open();
    const image = new FakeElement();
    documentStub.activeElement = image; windowStub.scrollY = 900;
    const time = button('Open screenshot at');
    await act(async () => { time.props.onClick(); });
    const viewer = renderer.root.findAll((node) => node.type === 'aside' && node.props.id === 'selected-moment')[0]!;
    expect(viewer.props.tabIndex).toBe(-1);
    await act(async () => { viewer.props.onKeyDown({ key: 'Escape', preventDefault() {} }); });
    expect(renderer.root.findAll((node) => node.props.id === 'selected-moment')).toHaveLength(0);
    expect(windowStub.scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'auto' });
    expect(image.focus).toHaveBeenCalled();
  });

  it('returns from the transcript to the notes navigation control', async () => {
    await open();
    await click('Notes');
    const control = new FakeElement();
    control.isConnected = false;
    control.dataset.returnId = 'view-transcript';
    const replacement = new FakeElement();
    documentStub.activeElement = control; windowStub.scrollY = 300;
    documentStub.querySelector.mockImplementation((selector: string) => selector === '[data-return-id="view-transcript"]' ? replacement : null);
    await click('Transcript');
    await click('Notes');
    expect(windowStub.scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'auto' });
    expect(replacement.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe('returning to a meeting', () => {
  it('keeps requested notes in progress after leaving through the sidebar', async () => {
    const host = createFakeNativeHost({ meetings: [unwritten()] });
    restore = installFakeNativeHost(host);
    windowStub.location.hash = '#/m/journey';
    await act(async () => { renderer = create(<App />, { createNodeMock: nodeMock }); });
    await click('Notes');
    await click('Write notes');
    expect(text()).toContain('Writing your notes…');
    const visit = async (hash: string) => {
      windowStub.location.hash = hash;
      await act(async () => { windowStub.dispatchEvent(new Event('hashchange')); });
    };
    await visit('#/meetings');
    await visit('#/m/journey');
    await click('Notes');
    expect(text()).toContain('Writing your notes…');
    expect(renderer.root.findAllByType('button').some((node) => content(node) === 'Write notes')).toBe(false);
  });
});

describe('storage failures never strand the reader', () => {
  it('tells an unreadable meeting apart from a missing one and retries', async () => {
    const host = createFakeNativeHost({ meetings: [fixture()] });
    restore = installFakeNativeHost(host);
    windowStub.location.hash = '#/m/journey';
    let fail = true;
    const load = host.loadMeeting.bind(host);
    host.loadMeeting = async (id) => { if (fail) throw new Error('Meeting storage is offline.'); return load(id); };
    await act(async () => { renderer = create(<App />, { createNodeMock: nodeMock }); });
    expect(text()).toContain('This meeting could not be opened');
    expect(text()).toContain('Meeting storage is offline.');
    expect(text()).not.toContain('Reading…');
    expect(text()).not.toContain('No such meeting');
    fail = false;
    await click('Try again');
    expect(text()).toContain('Launch sync');

    act(() => renderer.unmount());
    windowStub.location.hash = '#/m/deleted';
    await act(async () => { renderer = create(<App />, { createNodeMock: nodeMock }); });
    expect(text()).toContain('No such meeting');
  });

  it('shows unavailable storage in the sidebar instead of an empty library', async () => {
    const host = createFakeNativeHost();
    restore = installFakeNativeHost(host);
    host.listMeetings = async () => { throw new Error('offline'); };
    await act(async () => { renderer = create(<NotesWorkspace currentId="x"><p>body</p></NotesWorkspace>); });
    expect(text()).toContain('Meetings could not be read');
    expect(text()).not.toContain('Your meetings will appear here.');
  });

  it('keeps the sidebar storage warning when the library supplies an empty failed read', async () => {
    const host = createFakeNativeHost();
    restore = installFakeNativeHost(host);
    host.listMeetings = async () => { throw new Error('offline'); };
    await act(async () => { renderer = create(<Library onOpen={() => {}} onStart={async () => {}} onOpenLiveNotes={async () => {}} />); });
    const sidebar = renderer.root.findByProps({ 'aria-label': 'Meeting library' });
    expect(content(sidebar)).toContain('Meetings could not be read from this Mac’s storage.');
    expect(content(sidebar)).not.toContain('Your meetings will appear here.');
    expect(text()).toContain('Your saved meetings were left unchanged');
  });
});

describe('the lightweight library', () => {
  it('renames a meeting without loading its image-heavy record into the editor', async () => {
    const host = createFakeNativeHost({ meetings: [fixture()] });
    restore = installFakeNativeHost(host);
    await act(async () => { renderer = create(<Library onOpen={() => {}} onStart={async () => {}} onOpenLiveNotes={async () => {}} />); });
    await click('Rename “Launch sync”');
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': 'Meeting title' }).props.onChange({ target: { value: 'New title' } });
    });
    await act(async () => {
      renderer.root.findByProps({ className: 'rename' }).props.onSubmit({ preventDefault() {} });
    });
    expect(host.calls).toContain('renameMeeting:journey');
    expect(host.calls).not.toContain('loadMeeting:journey');
    expect(host.meetings.get('journey')?.images?.[0]?.dataUrl).toBe(png);
    expect(text()).toContain('New title');
  });

  it('searches persisted transcript text through native without listing image bytes', async () => {
    const host = createFakeNativeHost({ meetings: [fixture()] });
    restore = installFakeNativeHost(host);
    const listed = await host.listMeetings();
    expect(JSON.stringify(listed)).not.toContain(png);
    expect(JSON.stringify(listed)).not.toContain('Someone should update the pricing page.');

    await act(async () => { renderer = create(<Library onOpen={() => {}} onStart={async () => {}} onOpenLiveNotes={async () => {}} />); });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': 'Search meetings' }).props.onChange({ target: { value: 'pricing page' } });
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    expect(host.calls).toContain('searchMeetings:pricing page');
    expect(text()).toContain('said in the meeting');
    expect(text()).toContain('pricing page');

    host.searchMeetings = async () => { throw new Error('Search offline'); };
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': 'Search meetings' }).props.onChange({ target: { value: 'launch' } });
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    expect(text()).toContain('Search could not be completed.');
    expect(text()).not.toContain('Nothing found in any title');
  });
});
