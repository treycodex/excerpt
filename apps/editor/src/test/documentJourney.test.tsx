import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { Evidence, Item, Meeting, MeetingMutation } from '@excerpt/types';
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

async function open(meeting = fixture()): Promise<FakeNativeHost> {
  const host = createFakeNativeHost({ meetings: [meeting] });
  restore = installFakeNativeHost(host);
  await act(async () => { renderer = create(<Notes meeting={host.meetings.get(meeting.id)!} />, { createNodeMock: nodeMock }); });
  return host;
}
const overview = () => renderer.root.findAll((node) => node.props.className === 'overview')[0];
const nextStep = (title: string) => renderer.root.findAll((node) => node.type === 'li' && String(node.props.className).startsWith('next-step') && content(node).includes(title))[0]!;
const reviewCard = (title: string) => renderer.root.findAll((node) => node.type === 'article' && String(node.props.className).startsWith('item') && content(node).includes(title))[0]!;
const mutations = (host: FakeNativeHost) => host.calls.filter((call) => call.startsWith('mutateMeeting')).length;

describe('the finished meeting reads as one concise document', () => {
  it('shows a supported summary, chronological next steps, and every image exactly once', async () => {
    await open();
    const top = overview()!;
    expect(content(top)).toContain('Summary');
    expect(content(top)).toContain('We approved the October launch plan.');
    const steps = top.findAll((node) => node.type === 'li' && String(node.props.className).startsWith('next-step')).map(content);
    expect(steps[0]).toContain('Send the revised deck.');
    expect(steps[1]).toContain('Someone should update the pricing page.');
    // An owner appears only where the item carries one; nothing is inferred for the other.
    expect(steps[0]).toContain('Yours');
    expect(steps[1]).not.toContain('Yours');
    // No thumbnails above the document: each saved image is drawn once, in document order, with its caption.
    const images = renderer.root.findAll((node) => node.type === 'img' && node.props.src === png);
    expect(images.map((image) => image.props.alt)).toEqual(['Launch timeline slide', 'Imported chart']);
    expect(renderer.root.findAllByProps({ 'aria-label': 'Screenshot caption' }).map((field) => field.props.value))
      .toEqual(['Launch timeline slide', 'Imported chart']);
  });

  it('hides empty sections instead of showing empty headings', async () => {
    const quiet = { ...fixture(), items: [], images: [], notes: { version: 1 as const, method: 'extractive' as const, keyPoints: [], topics: [], blocks: [] } };
    await open(quiet);
    expect(overview()).toBeUndefined();
    expect(text()).not.toContain('Next steps');
    expect(text()).toContain('No decisions or action items found. Your transcript and screenshots are saved.');
  });
});

describe('next steps have one identity across the document and detailed review', () => {
  it('completes, assigns and rewords the same persisted item from either place', async () => {
    const host = await open();
    const before = mutations(host);

    await act(async () => { nextStep('Send the revised deck.').findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }); });
    expect(host.meetings.get('journey')!.items.find((item) => item.id === 'deck')!.completed).toBe(true);
    expect(reviewCard('Send the revised deck.').findByProps({ type: 'checkbox' }).props.checked).toBe(true);

    // Assign in detailed review; the document reflects it without its own copy.
    await click('Assign to me', reviewCard('Someone should update the pricing page.'));
    expect(host.meetings.get('journey')!.items.find((item) => item.id === 'pricing')!.assignee).toBe('you');
    expect(content(nextStep('Someone should update the pricing page.'))).toContain('Yours');

    // Reword in the document; review shows the corrected wording on the same item.
    await click('Edit wording', nextStep('Someone should update the pricing page.'));
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Next step wording' }).props.onChange({ target: { value: 'Update the pricing page' } }); });
    await act(async () => { renderer.root.findAll((node) => node.type === 'form' && node.props.className === 'next-step-edit')[0]!.props.onSubmit({ preventDefault() {} }); });
    const saved = host.meetings.get('journey')!;
    expect(saved.items.find((item) => item.id === 'pricing')!.title).toBe('Update the pricing page');
    expect(content(reviewCard('Update the pricing page'))).toContain('Update the pricing page');

    // Three edits, three typed item mutations; no parallel action list, no document rewrite.
    expect(mutations(host) - before).toBe(3);
    expect(saved.items.map((item) => item.id).sort()).toEqual(['deck', 'launch', 'pricing']);
    expect(saved.notes).toEqual(fixture().notes);
  });

  it('sends item edits through the typed setReviewItems mutation only', async () => {
    const host = await open();
    const sent: MeetingMutation[] = [];
    const original = host.mutateMeeting.bind(host);
    host.mutateMeeting = async (mutation) => { sent.push(mutation); return original(mutation); };
    await click('Unassign', nextStep('Send the revised deck.'));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.changes.map((change) => change.type)).toEqual(['setReviewItems']);
    expect(host.meetings.get('journey')!.items.find((item) => item.id === 'deck')!.assignee).toBe('unassigned');
  });
});

describe('source and correction trips return to the reader’s place', () => {
  it('restores scroll position and focus after a source panel, transcript correction, and close', async () => {
    const host = await open();
    const opener = new FakeElement();
    documentStub.activeElement = opener; windowStub.scrollY = 640;
    await click('Show the source for: Send the revised deck.', nextStep('Send the revised deck.'));
    expect(text()).toContain('Source passages for this note');

    const openInTranscript = new FakeElement();
    documentStub.activeElement = openInTranscript; windowStub.scrollY = 120;
    await click('Open in transcript');
    expect(text()).toContain('Back to the note you were checking');

    // Correct the line inline, beside the words being corrected.
    const line = renderer.root.findAll((node) => node.type === 'p' && String(node.props.className).startsWith('line-row') && content(node).includes('revised deck'))[0]!;
    await click('Correct', line);
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Corrected transcript' }).props.onChange({ target: { value: 'I will send the revised launch deck.' } }); });
    await click('Apply correction and update notes');
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
    const time = renderer.root.findAll((node) => node.type === 'button' && node.props.className === 'moment-time')[0]!;
    await act(async () => { time.props.onClick(); });
    const viewer = renderer.root.findAll((node) => node.type === 'aside' && node.props.id === 'selected-moment')[0]!;
    expect(viewer.props.tabIndex).toBe(-1);
    await act(async () => { viewer.props.onKeyDown({ key: 'Escape', preventDefault() {} }); });
    expect(renderer.root.findAll((node) => node.props.id === 'selected-moment')).toHaveLength(0);
    expect(windowStub.scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'auto' });
    expect(image.focus).toHaveBeenCalled();
  });

  it('returns from detailed review to the navigation control that opened it', async () => {
    await open();
    const control = new FakeElement();
    control.isConnected = false;
    control.dataset.returnId = 'view-review';
    const replacement = new FakeElement();
    documentStub.activeElement = control; windowStub.scrollY = 300;
    documentStub.querySelector.mockImplementation((selector: string) => selector === '[data-return-id="view-review"]' ? replacement : null);
    await click('Review extracted items');
    expect(text()).toContain('Detailed review');
    await click('Back to notes');
    expect(windowStub.scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'auto' });
    expect(replacement.focus).toHaveBeenCalledWith({ preventScroll: true });
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
