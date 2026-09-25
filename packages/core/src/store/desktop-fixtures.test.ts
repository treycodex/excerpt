import { describe, expect, it } from 'vitest';
import type { Meeting } from '@excerpt/types';
import meetingFixture from '../../fixtures/desktop-meetings.json';
import regressionFixture from '../../fixtures/desktop-regressions.json';

type FixtureCase = { name: string; state: 'finished' | 'draft'; meeting: Meeting };
const fixtures = meetingFixture as unknown as { version: number; meetings: FixtureCase[] };
const regressions = regressionFixture as unknown as { scenarios: { id: string; phase: number; fixtures: string[] }[] };

describe('desktop migration fixtures', () => {
  it('cover every persisted state needed before desktop-only migration', () => {
    const names = new Set(fixtures.meetings.map((fixture) => fixture.name));
    expect(fixtures.version).toBe(1);
    expect(names).toEqual(new Set([
      'text-only-finished', 'screenshot-only-finished', 'handwritten-finished',
      'corrected-finished', 'reviewed-finished', 'deleted-blocks-finished',
      'legacy-sections-finished', 'interrupted-draft',
    ]));
    expect(fixtures.meetings.filter((fixture) => fixture.state === 'finished')).toHaveLength(7);
  });

  it('keeps legacy persisted shapes and enum values decodable by shared consumers', () => {
    for (const fixture of fixtures.meetings) {
      expect(fixture.meeting.id).toMatch(/^fixture-/);
      expect(fixture.meeting.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Array.isArray(fixture.meeting.events)).toBe(true);
      expect(Array.isArray(fixture.meeting.items)).toBe(true);
    }
    const legacy = fixtures.meetings.find((fixture) => fixture.name === 'legacy-sections-finished')!.meeting;
    expect(legacy.processing).toBe('cloud');
    expect(legacy.notes!.blocks).toBeUndefined();
    expect(legacy.notes!.topics[0]!.bullets[0]!.text).toContain('Legacy blocks');
    expect(fixtures.meetings.find((fixture) => fixture.name === 'reviewed-finished')!.meeting.processing).toBe('demo');
  });

  it('keeps edited, corrected, and interrupted state explicit', () => {
    const corrected = fixtures.meetings.find((fixture) => fixture.name === 'corrected-finished')!.meeting;
    expect(corrected.events[0]!.originalText).toContain('Thursday');
    expect(corrected.events[0]!.corrections).toHaveLength(1);
    expect(corrected.sourceRevision).toBe(2);
    expect(fixtures.meetings.find((fixture) => fixture.name === 'deleted-blocks-finished')!.meeting.notes!.deletedBlocks).toHaveLength(1);

    const interrupted = fixtures.meetings.find((fixture) => fixture.name === 'interrupted-draft')!;
    expect(interrupted.meeting.endedAt).toBeUndefined();
    expect(interrupted.meeting.draftRevision).toBe(4);
    expect(interrupted.meeting.images).toHaveLength(1);
  });

  it('maps every recorded regression to its owning implementation phase and fixture', () => {
    const fixtureNames = new Set(fixtures.meetings.map((fixture) => fixture.name));
    expect(regressions.scenarios.map((scenario) => scenario.id)).toContain('finished-meeting-edits-persist');
    for (const scenario of regressions.scenarios) {
      expect(scenario.phase).toBeGreaterThanOrEqual(1);
      expect(scenario.phase).toBeLessThanOrEqual(8);
      for (const fixture of scenario.fixtures) expect(fixtureNames.has(fixture)).toBe(true);
    }
  });
});
