import { describe, expect, it } from 'vitest';
import type { Meeting, TranscriptEvent } from '@excerpt/types';
import { extractItems } from '../extract';
import { toSentences } from '../extract/sentences';
import { toMarkdown } from '../export/markdown';
import { buildNotesDocument, noteTitle, preserveNoteEdits, refreshMeetingNotes, shapeNotice } from './summary';

const event = (id: string, text: string, at = 0): TranscriptEvent => ({ id, text, tArrived: at,
  isFinal: true, role: 'you', speakerLabel: 'YOU', sessionId: 's' });
const meeting = (events: TranscriptEvent[]): Meeting => ({ id: 'm', title: 'Launch review',
  startedAt: '2026-09-07T09:00:00Z', processing: 'on-device', events, items: [] });

describe('readable meeting notes', () => {
  it('joins a fragmented commitment while preserving exact source quotes', () => {
    const events = [event('a', "I'll send the revised", 100), event('b', 'deck before Friday.', 2000)];
    const [item] = extractItems(events, new Date('2026-09-07T09:00:00Z'));
    expect(noteTitle(item!)).toBe('Send the revised deck before Friday.');
    expect(item!.due).toBe('2026-09-11');
    expect(item!.evidence.map((e) => e.quote)).toEqual(events.map((e) => e.text));
  });
  it('does not join across speakers or long pauses and preserves decimals', () => {
    const events = [event('a', "I'll send"), { ...event('b', 'the deck.', 500), role: 'remote' as const }, event('c', 'Budget is 3.14 million.', 30000)];
    expect(toSentences(events).map((s) => s.text)).toEqual(events.map((e) => e.text));
  });
  it('captures context without requiring an action or decision keyword', () => {
    const input = meeting([event('a', 'The customer onboarding flow is confusing for new teams.'), event('b', 'The customer onboarding flow is confusing for new teams.', 1000)]);
    const notes = buildNotesDocument(input);
    expect(notes.keyPoints).toHaveLength(1);
    expect(notes.topics[0]!.bullets[0]!.evidence[0]!.eventIds).toEqual(['a']);
  });
  it('recognizes more commitments but excludes hypotheticals and audio checks', () => {
    const events = [event('a', "I'll review the pricing."), event('b', "If legal approves, I'll send the deck."), event('c', 'Can you hear me?')];
    const actions = extractItems(events).filter((i) => i.category === 'action');
    expect(actions).toHaveLength(1);
    expect(noteTitle(actions[0]!)).toBe('Review the pricing.');
  });
  it('uses an explicit corrected deadline and merges duplicate tasks', () => {
    const text = "I'll send the deck by Thursday, actually Friday.";
    const items = extractItems([event('a', text), event('b', text, 1000)], new Date('2026-09-07T09:00:00Z'));
    expect(items).toHaveLength(1);
    expect(items[0]!.due).toBe('2026-09-11');
    expect(items[0]!.evidence).toHaveLength(2);
  });
  it('preserves edited bullets and completed actions on regeneration and export', () => {
    let input = refreshMeetingNotes(meeting([event('a', "I'll send the revised deck before Friday.")]));
    input.items[0]!.completed = true;
    input.items[0]!.userEdited = true;
    input.items[0]!.title = 'Send final deck';
    input.notes!.keyPoints[0]!.text = 'My edited point';
    input.notes!.keyPoints[0]!.userEdited = true;
    const next = refreshMeetingNotes(input);
    expect(next.notes!.keyPoints[0]!.text).toBe('My edited point');
    expect(next.items[0]!.completed).toBe(true);
    expect(toMarkdown(next)).toContain('- [x] **Send final deck**');
    expect(toMarkdown(next)).toContain('My edited point');
  });
  it('retains edits even when a new summary no longer selects their source', () => {
    const old = buildNotesDocument(meeting([event('a', 'The onboarding flow needs a clearer first step.')]));
    old.keyPoints[0]!.userEdited = true;
    expect(preserveNoteEdits({ version: 1, method: 'on-device', keyPoints: [], topics: [] }, old).keyPoints).toHaveLength(1);
  });
  it('editing one task does not suppress another task in the same transcript event', () => {
    const input = refreshMeetingNotes(meeting([event('a', "I'll send the deck. I'll review the pricing.")]));
    input.items[0]!.title = 'My deck task';
    input.items[0]!.userEdited = true;
    const next = refreshMeetingNotes(input);
    expect(next.items).toHaveLength(2);
    expect(next.items.map((i) => noteTitle(i))).toContain('Review the pricing.');
  });
});

const remote = (id: string, text: string, at = 0): TranscriptEvent => ({ id, text, tArrived: at,
  isFinal: true, role: 'remote', speakerLabel: 'SPEAKER', sessionId: 's' });

describe('what kind of recording this is', () => {
  const talk = (words: number) => Array.from({ length: Math.ceil(words / 10) }, (_, i) =>
    remote(`t${i}`, 'so the next archetype is the one everybody in college knows about.', i * 4000));

  it('says plainly that one voice is not a conversation', () => {
    const notice = shapeNotice(meeting(talk(300)));
    expect(notice).toContain('Only one voice');
    // Plain about what Excerpt looks for, rather than blaming the recording.
    expect(notice).toContain('decisions, actions');
  });

  it('stays quiet when two voices were recorded', () => {
    const events = [...talk(300), event('mine', "I'll take the revised deck and send it Friday.", 999999)];
    expect(shapeNotice(meeting(events))).toBeUndefined();
  });

  it('stays quiet about a recording too short to have a shape', () => {
    expect(shapeNotice(meeting(talk(60)))).toBeUndefined();
  });

  it('travels on the notes document, so the reader sees it', () => {
    expect(buildNotesDocument(meeting(talk(300))).notice).toContain('Only one voice');
    expect(buildNotesDocument(meeting([event('a', 'The launch moves to October.')])).notice).toBeUndefined();
  });
});

describe('an excerpt that points at something', () => {
  const remote = (id: string, text: string, at: number): TranscriptEvent =>
    ({ ...event(id, text, at), role: 'remote', speakerLabel: 'SPEAKER' });

  it('carries the sentence that says what "it" was', () => {
    // Quoted correctly and meaning nothing is still a bad note.
    const notes = buildNotesDocument(meeting([
      remote('a', 'Why did the podcast read get dropped from the client plan?', 0),
      remote('b', 'Budget, mostly.', 3000),
      remote('c', 'It might come back in January once the client budget resets.', 6000),
    ]));
    const texts = [...notes.keyPoints, ...notes.topics.flatMap((t) => t.bullets)].map((b) => b.text);
    expect(texts.some((t) => t.startsWith('Budget, mostly. It might come back'))).toBe(true);
  });

  it('keeps the evidence for both halves of what it joined', () => {
    const notes = buildNotesDocument(meeting([
      remote('a', 'Why did the podcast read get dropped from the client plan?', 0),
      remote('b', 'Budget, mostly.', 3000),
      remote('c', 'It might come back in January once the client budget resets.', 6000),
    ]));
    const joined = [...notes.keyPoints, ...notes.topics.flatMap((t) => t.bullets)]
      .find((b) => b.text.startsWith('Budget, mostly.'));
    expect(joined!.evidence.map((e) => e.eventIds[0])).toEqual(['b', 'c']);
  });

  it('never joins across a change of voice', () => {
    // A pronoun answered by the other side belongs to a different turn; joining
    // them would invent the connection rather than restore it.
    const notes = buildNotesDocument(meeting([
      { ...event('a', 'Budget, mostly.', 0), role: 'you', speakerLabel: 'YOU' },
      remote('b', 'It might come back in January once the client budget resets.', 3000),
    ]));
    const texts = [...notes.keyPoints, ...notes.topics.flatMap((t) => t.bullets)].map((b) => b.text);
    expect(texts.some((t) => t.startsWith('Budget, mostly. It'))).toBe(false);
  });

  it('leaves a bullet that names its own subject alone', () => {
    const notes = buildNotesDocument(meeting([
      remote('a', 'Budget, mostly.', 0),
      remote('b', 'The podcast read is coming back in January once budget resets.', 3000),
    ]));
    const texts = [...notes.keyPoints, ...notes.topics.flatMap((t) => t.bullets)].map((b) => b.text);
    expect(texts.some((t) => t.startsWith('The podcast read is coming back'))).toBe(true);
    expect(texts.some((t) => t.startsWith('Budget, mostly. The podcast'))).toBe(false);
  });
});

describe('notes follow the length of the meeting', () => {
  /** A meeting of `minutes`, dense enough that selection has to choose. */
  const long = (minutes: number) => {
    const subjects = ['the hero film', 'the media plan', 'the paid social cut', 'the end card',
      'the client deck', 'the out of home buy', 'the landing page', 'the retail pack'];
    const events: TranscriptEvent[] = [];
    const gap = 7000;
    for (let i = 0; i * gap < minutes * 60_000; i++) {
      const subject = subjects[i % subjects.length];
      events.push(event(`e${i}`,
        `The completion rate on ${subject} is up ${i + 2} points against the client benchmark.`,
        i * gap));
    }
    return meeting(events);
  };

  it('keeps a short meeting in one undivided list', () => {
    const notes = buildNotesDocument(long(4));
    expect(notes.topics).toHaveLength(1);
    expect(notes.topics[0]!.title).toBe('Discussion excerpts');
  });

  it('breaks a long meeting into passages titled by the clock', () => {
    // Not by subject. A heading is an assertion about what a meeting was about,
    // and a time range is the only one the transcript can actually support.
    const notes = buildNotesDocument(long(35));
    expect(notes.topics.length).toBeGreaterThan(2);
    expect(notes.topics[0]!.title).toBe('0:00 – 10:00');
    expect(notes.topics[1]!.title).toBe('10:00 – 20:00');
    // and the last one ends where the recording does, not on a round number
    expect(notes.topics.at(-1)!.title).toBe('30:00 – 34:53');
  });

  it('bounds the excerpts instead of growing them without limit', () => {
    // An hour used to come back as one run of roughly 230 bullets.
    const bullets = buildNotesDocument(long(60)).topics.reduce((n, t) => n + t.bullets.length, 0);
    expect(bullets).toBeLessThan(60);
  });

  it('keeps every passage represented rather than only the densest stretch', () => {
    const notes = buildNotesDocument(long(35));
    for (const topic of notes.topics) expect(topic.bullets.length).toBeGreaterThan(0);
  });

  it('holds excerpts in order within a passage', () => {
    for (const topic of buildNotesDocument(long(35)).topics) {
      const times = topic.bullets.map((b) => b.evidence[0]!.tArrived);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it('gives a longer meeting more key points, within a ceiling', () => {
    expect(buildNotesDocument(long(4)).keyPoints).toHaveLength(5);
    expect(buildNotesDocument(long(60)).keyPoints.length).toBeGreaterThan(5);
    expect(buildNotesDocument(long(120)).keyPoints.length).toBeLessThanOrEqual(12);
  });
});

describe('choosing excerpts without a fixed vocabulary', () => {
  it('lifts a sentence on what this meeting keeps returning to', () => {
    // Not one word of the built-in business list appears here. Before recurring
    // terms were counted, every sentence scored the same and selection was arbitrary.
    const events = [
      remote('a', 'The telescope mirror needs recoating before the observing run.', 1000),
      remote('b', 'Right, so the mirror recoating has to finish before the run.', 5000),
      remote('c', 'Anyway I suppose that is roughly where we got to last week.', 9000),
    ];
    const document = buildNotesDocument(meeting(events));
    const chosen = document.keyPoints.map((b) => b.text).join(' ');
    expect(chosen).toContain('mirror');
    expect(document.keyPoints[0]!.text).toContain('mirror');
  });
});
