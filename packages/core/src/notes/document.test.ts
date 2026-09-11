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
