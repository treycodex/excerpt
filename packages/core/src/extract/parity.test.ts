import { describe, expect, it } from 'vitest';
import type { TranscriptEvent } from '@excerpt/types';
import { extractItems } from './index';
// Imported, not read from disk, so this file needs no Node types and the same
// fixtures compile under the same tsconfig as everything else.
import parity from '../../fixtures/parity.json';

/**
 * The TypeScript half of the parity harness. The Swift half — `ParityTests` in
 * apps/mac — reads this same file and runs it through the compiled bundle in
 * JavaScriptCore. A case that passes here and fails there means the website and
 * the Mac app disagree about what a decision is, which is the one class of bug
 * "one shared engine" exists to make impossible.
 */
const fixtures = parity as unknown as {
  reference: string;
  cases: {
    name: string;
    lines: ['you' | 'remote', string][];
    expect: {
      category?: string;
      state?: string;
      assignee?: string;
      due?: string;
      titleIsSpanOf?: string;
    }[];
  }[];
};

describe('engine parity fixtures', () => {
  for (const testCase of fixtures.cases) {
    it(testCase.name, () => {
      const events: TranscriptEvent[] = testCase.lines.map(([role, text], i) => ({
        id: `e${i}`,
        sessionId: 'parity',
        role,
        speakerLabel: role === 'you' ? 'YOU' : 'SPEAKER',
        text,
        isFinal: true,
        tArrived: i * 4000,
      }));

      const items = extractItems(events, new Date(fixtures.reference));
      expect(items.length).toBe(testCase.expect.length);

      testCase.expect.forEach((want, i) => {
        const item = items[i]!;
        if (want.category) expect(item.category).toBe(want.category);
        if (want.state) expect(item.state).toBe(want.state);
        if (want.assignee) expect(item.assignee).toBe(want.assignee);
        if (want.due) expect(item.due).toBe(want.due);
        if (want.titleIsSpanOf) {
          // Extractive means the title is a run of words that was actually said.
          expect(want.titleIsSpanOf.includes(item.title.replace(/…$/, ''))).toBe(true);
        }
      });
    });
  }
});
