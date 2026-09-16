import { describe, expect, it } from 'vitest';
import { healthOf, sourceConcern } from './health';
import type { SourceHealth, SourceSignals } from './health';
// Imported, not read from disk, so this file needs no Node types and compiles
// under the same tsconfig as everything else — as `extract/parity.test.ts` does.
import fixtures from '../../fixtures/source-health.json';

/**
 * The TypeScript half of the source-health parity harness.
 *
 * `fixtures/source-health.json` is read here against `healthOf`, and by the
 * Swift tests against `SourceHealth.of`. A capture source must not be described
 * one way in the browser and another way on the Mac.
 */
describe('what one capture source is doing', () => {
  for (const testCase of fixtures.cases as { name: string; signals: SourceSignals; expect: SourceHealth }[]) {
    it(testCase.name, () => {
      expect(healthOf(testCase.signals)).toBe(testCase.expect);
    });
  }
});

describe('what a person is told about it', () => {
  it('says nothing about a source nobody is speaking into', () => {
    // Warning about a quiet microphone trains people to ignore the line that
    // also has to carry the real problem.
    expect(sourceConcern('Your microphone', 'silent')).toBeUndefined();
    expect(sourceConcern('Your microphone', 'hearing')).toBeUndefined();
    expect(sourceConcern('Your microphone', 'starting')).toBeUndefined();
  });

  it('names the source and what is wrong with it', () => {
    expect(sourceConcern('Meeting audio', 'stalled')).toContain('Meeting audio');
    expect(sourceConcern('Meeting audio', 'stalled')).toContain('nothing is being recognised');
    expect(sourceConcern('Your microphone', 'failed')).toContain('stopped working');
  });

  it('says the notes are safe when a source dies', () => {
    expect(sourceConcern('Your microphone', 'failed')).toContain('notes so far are safe');
  });
});
