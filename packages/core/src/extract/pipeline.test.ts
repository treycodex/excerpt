import { describe, expect, it } from 'vitest';
import type { TranscriptEvent } from '@excerpt/types';
import { extractItems } from './index';
import { classifyAction } from './actions';
import { isOpenQuestion } from './questions';
import { toSentences } from './sentences';

// A Monday, so weekday deadlines in these tests are unambiguous.
const REF = new Date('2026-09-07T09:00:00Z');

let n = 0;
const ev = (text: string, role: 'you' | 'remote', at: number): TranscriptEvent => ({
  id: `e${n++}`, sessionId: 's', role,
  speakerLabel: role === 'you' ? 'YOU' : 'SPEAKER',
  text, isFinal: true, tArrived: at,
});

describe('assignment is conservative', () => {
  it('assigns to you only for self-commitment on your own mic', () => {
    const s = toSentences([ev("I'll take the revised deck.", 'you', 0)])[0]!;
    expect(classifyAction(s)).toEqual({ assignee: 'you', ambiguous: false });
  });

  it('does NOT assign to you when a remote speaker asks "can you"', () => {
    // Two streams tell us who spoke, never whom they addressed.
    const s = toSentences([ev('Can you send the revised deck?', 'remote', 0)])[0]!;
    expect(classifyAction(s)).toEqual({ assignee: 'unassigned', ambiguous: true });
  });

  it('does not assign to you when somebody else commits themselves', () => {
    const s = toSentences([ev("I'll take the deck.", 'remote', 0)])[0]!;
    expect(classifyAction(s)?.assignee).toBe('unassigned');
  });
});

describe('open questions', () => {
  const build = (lines: [string, 'you' | 'remote', number][]) =>
    toSentences(lines.map(([t, r, a]) => ev(t, r, a)));

  it('stays open when the reply hedges', () => {
    const s = build([
      ['Do we still need the out-of-home buy?', 'remote', 0],
      ["I'm not sure the out-of-home spend is justified yet.", 'you', 4000],
    ]);
    expect(isOpenQuestion(s[0]!, s)).toBe(true);
  });

  it('closes when answered outright', () => {
    const s = build([
      ['Do we still need the out-of-home buy?', 'remote', 0],
      ['Yes, media confirmed it this morning.', 'you', 4000],
    ]);
    expect(isOpenQuestion(s[0]!, s)).toBe(false);
  });

  it('ignores proposals phrased as questions', () => {
    const s = build([['What if we moved the launch to October?', 'remote', 0]]);
    expect(isOpenQuestion(s[0]!, s)).toBe(false);
  });
});

describe('one sentence yields one item', () => {
  it('treats a dated request as an action with a due date, not three items', () => {
    const items = extractItems([ev('Can you send the revised deck before Friday?', 'remote', 0)], REF);
    expect(items).toHaveLength(1);
    expect(items[0]!.category).toBe('action');
    expect(items[0]!.assignee).toBe('unassigned');
    expect(items[0]!.due).toBe('2026-09-11');
  });

  it('captures a self-committed action with its own deadline', () => {
    const items = extractItems([ev("I'll take the revised deck and get it over by Thursday.", 'you', 0)], REF);
    expect(items).toHaveLength(1);
    expect(items[0]!.assignee).toBe('you');
    expect(items[0]!.due).toBe('2026-09-10');
  });

  it('reads a weekday named on that same weekday as the NEXT one', () => {
    // Meeting held on Thursday: "by Thursday" means next week, not today.
    const thursday = new Date('2026-09-10T09:00:00Z');
    const items = extractItems([ev("I'll send it by Thursday.", 'you', 0)], thursday);
    expect(items[0]!.due).toBe('2026-09-17');
  });
});

describe('full demo script', () => {
  const script: TranscriptEvent[] = [
    ev('Thanks for pulling the numbers together.', 'remote', 2200),
    ev('I pulled the last four weeks this morning.', 'you', 5600),
    ev('The hero film is landing well, but the client feels the second cut is too long.', 'remote', 10400),
    ev('What if we moved the launch to October?', 'remote', 14200),
    ev("We'll discuss October next week once media come back.", 'you', 18600),
    ev("We're not moving the whole campaign, just the hero spot.", 'remote', 23000),
    ev("If legal signs off, we'll go with the October date.", 'remote', 27800),
    ev("Okay. Let's move the launch to October. That's decided.", 'remote', 32400),
    ev('Can you send the revised deck before Friday?', 'remote', 36600),
    ev("I'll take the revised deck and get it over by Thursday.", 'you', 41000),
    ev('Do we still need the out-of-home buy?', 'remote', 45400),
    ev("I'm not sure the out-of-home spend is justified yet.", 'you', 49800),
  ];
  const items = extractItems(script, REF);

  it('finds exactly one decided decision', () => {
    const decided = items.filter((i) => i.category === 'decision' && i.state === 'decided');
    expect(decided).toHaveLength(1);
    expect(decided[0]!.title).toBe("Let's move the launch to October.");
  });

  it('assigns exactly one action to you', () => {
    const mine = items.filter((i) => i.assignee === 'you');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.title).toContain('revised deck');
  });

  it('leaves the unattributable request in needs-review', () => {
    const req = items.find((i) => i.title.startsWith('Can you send'));
    expect(req?.assignee).toBe('unassigned');
  });

  it('keeps the hedged question open', () => {
    expect(items.some((i) => i.category === 'question' && i.title.startsWith('Do we still'))).toBe(true);
  });

  it('never marks a guarded sentence as decided', () => {
    const decidedTitles = items.filter((i) => i.state === 'decided').map((i) => i.title);
    expect(decidedTitles).not.toContain("We'll discuss October next week once media come back.");
    expect(decidedTitles).not.toContain("We're not moving the whole campaign, just the hero spot.");
    expect(decidedTitles).not.toContain("If legal signs off, we'll go with the October date.");
  });
});

describe('deadlines are not fabricated', () => {
  it('does not read a past duration as a deadline', () => {
    // chrono parses "the last four weeks" as a date. It is not a deadline.
    const items = extractItems([ev('I pulled the last four weeks this morning.', 'you', 0)], REF);
    expect(items.every((i) => !i.due)).toBe(true);
  });

  it('never attaches a date found in another sentence', () => {
    const items = extractItems([
      ev('I pulled the last four weeks this morning.', 'you', 5600),
      ev('What if we moved the launch to October?', 'remote', 14200),
    ], REF);
    const proposal = items.find((i) => i.title.startsWith('What if'));
    expect(proposal?.due).toBeUndefined();
  });

  it('never produces a due date before the meeting', () => {
    const items = extractItems([
      ev('I pulled the last four weeks this morning.', 'you', 0),
      ev("Can you send it before Friday?", 'remote', 4000),
    ], REF);
    for (const i of items) {
      if (i.due) expect(new Date(i.due).getTime()).toBeGreaterThanOrEqual(REF.getTime() - 86_400_000);
    }
  });

  it('requires a deadline preposition, not merely a date', () => {
    const items = extractItems([ev("We'll go with the October date.", 'remote', 0)], REF);
    expect(items.every((i) => !i.due)).toBe(true);
  });
});
