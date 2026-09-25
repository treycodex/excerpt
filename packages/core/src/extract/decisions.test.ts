import { describe, expect, it } from 'vitest';
import type { TranscriptEvent } from '@excerpt/types';
import { extractItems } from './index';
import { classify } from './decisions';
import { normalise, toSentences } from './sentences';

const ev = (text: string, i = 0): TranscriptEvent => ({
  id: `e${i}`, sessionId: 's', role: 'remote', speakerLabel: 'SPEAKER',
  text, isFinal: true, tArrived: i * 1000,
});
const state = (text: string) =>
  classify({ text, norm: normalise(text), event: ev(text), index: 0 })?.state ?? null;

describe('decision classification', () => {
  it('detects a plain decision', () => {
    expect(state("Let's move the launch to October.")).toBe('decided');
    expect(state("That's decided.")).toBe('decided');
  });

  it('treats a question as a proposal, never a decision', () => {
    expect(state('What if we moved the launch to October?')).toBe('proposed');
    expect(state('Should we go with October?')).toBe('proposed');
  });

  // Each of these is a sentence a naive cue matcher calls a decision.
  it('does not decide on a negated commitment', () => {
    expect(state("We're not moving the whole campaign, just the hero spot.")).not.toBe('decided');
  });

  it('does not decide on a conditional commitment', () => {
    expect(state("If legal signs off, we'll go with the October date.")).toBe('proposed');
  });

  it('does not mistake a decision to discuss for a decision', () => {
    expect(state("We'll discuss October next week once media come back.")).not.toBe('decided');
  });

  it('does not decide on reported speech', () => {
    expect(state("She said let's go with October.")).not.toBe('decided');
  });

  // Recall, not precision. Every one of these is an ordinary way to settle
  // something that found nothing while the verb after the cue was enumerated.
  it('reads a commitment whatever verb completes it', () => {
    expect(state("Let's shift twenty percent of the display budget over.")).toBe('decided');
    expect(state("We'll brief the client on Monday morning.")).toBe('decided');
    expect(state("We're going to run the coastline cut.")).toBe('decided');
    expect(state("We're shipping the fifteen second edit.")).toBe('decided');
  });

  it('reads a decision reported in the past tense', () => {
    expect(state('We went with the coastline cut in the end.')).toBe('decided');
    expect(state('We decided on the October date.')).toBe('decided');
    expect(state('We settled on the shorter edit.')).toBe('decided');
    expect(state('We landed on twenty percent.')).toBe('decided');
  });

  it('still refuses a cue completed by a verb that settles nothing', () => {
    // Deferral is the future-discussion guard in another shape: parking a
    // subject settles when it is discussed, not what was decided about it.
    expect(state("Let's park that for now.")).toBeNull();
    expect(state("Let's table the out of home buy.")).toBeNull();
    expect(state("Let's see how the numbers land.")).toBeNull();
    expect(state("We'll think about the October date.")).toBeNull();
    expect(state("We're looking at the coastline cut.")).toBeNull();
    expect(state("Let's go.")).toBeNull();
  });

  it('records a decision not to do something', () => {
    expect(state('We are not doing the podcast read this quarter.')).toBe('decided');
    expect(state("We won't run the out of home buy.")).toBe('decided');
    expect(state("We're dropping the radio edit.")).toBe('decided');
    expect(state('We decided against the longer cut.')).toBe('decided');
  });

  it('does not read a narrowed plan as a decision against it', () => {
    // "just the hero spot" decides to move something. Filed as a negative
    // decision it would report the opposite of what was said.
    expect(state("We're not moving the whole campaign, just the hero spot.")).not.toBe('decided');
    expect(state("We're not shipping the long cut, only the fifteen.")).not.toBe('decided');
  });

  it('holds a negative decision to the same guards as a positive one', () => {
    expect(state("She said we're not doing the podcast read.")).toBe('proposed');
    expect(state("If the budget holds we won't drop the radio edit.")).toBe('proposed');
  });

  it('ignores ordinary conversation', () => {
    expect(state('Thanks for pulling the numbers together.')).toBeNull();
    expect(state('I pulled the last four weeks this morning.')).toBeNull();
  });
});

describe('evidence', () => {
  const events = [
    ev('Thanks for pulling the numbers together.', 0),
    ev("Okay. Let's move the launch to October. That's decided.", 1),
  ];

  it('quotes verbatim from a real event', () => {
    const items = extractItems(events);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      for (const e of item.evidence) {
        const source = events.find((x) => x.id === e.eventIds[0]);
        expect(source).toBeDefined();
        expect(source!.text).toContain(e.quote);
      }
    }
  });

  it('strips leading filler from the title without rewriting words', () => {
    const items = extractItems(events);
    const decided = items.find((i) => i.state === 'decided');
    expect(decided?.title).toBe("Let's move the launch to October.");
  });

  it('splits a multi-sentence event into separate sentences', () => {
    expect(toSentences(events)).toHaveLength(4);
  });

  it('does not emit a bare confirmation as its own item', () => {
    const items = extractItems(events);
    expect(items.map((i) => i.title)).not.toContain("That's decided.");
  });

  it('attaches a confirmation as corroborating evidence instead', () => {
    const decided = extractItems(events).find((i) => i.state === 'decided');
    expect(decided?.evidence).toHaveLength(2);
    expect(decided?.evidence[1]?.quote).toBe("That's decided.");
  });

  it('drops a confirmation with no decision to attach to', () => {
    expect(extractItems([ev('Agreed.', 0)])).toHaveLength(0);
  });

  it('never assigns to you without explicit self-commitment', () => {
    for (const item of extractItems(events)) expect(item.assignee).toBe('unassigned');
  });
});
