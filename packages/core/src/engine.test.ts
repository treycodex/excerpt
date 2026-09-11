import { describe, expect, it } from 'vitest';
import type { Meeting, TranscriptEvent } from '@excerpt/types';
import { engine, ENGINE_VERSION } from './engine';

const event = (id: string, text: string, at = 0): TranscriptEvent => ({ id, text, tArrived: at,
  isFinal: true, role: 'you', speakerLabel: 'YOU', sessionId: 's' });

const meeting = (events: TranscriptEvent[]): Meeting => ({ id: 'm', title: 'Launch review',
  startedAt: '2026-09-07T09:00:00Z', processing: 'on-device', events, items: [] });

/**
 * The Mac app reaches these through JavaScriptCore, so the contract is JSON in and
 * JSON out. `notes` is here because the app had no fallback when its optional
 * on-device summary failed, and saved meetings with no notes in them at all.
 */
describe('the engine contract', () => {
  it('carries a version, so a stale bundle is visible rather than subtle', () => {
    expect(engine.version).toBe(ENGINE_VERSION);
  });

  it('builds the extractive notes document the host falls back to', () => {
    const events = [
      event('a', 'The onboarding flow loses new teams at the permissions step.', 1000),
      event('b', 'Legal approval is still pending, so the launch moves to October.', 5000),
    ];
    const document = JSON.parse(engine.notes(JSON.stringify(meeting(events))));
    expect(document.method).toBe('extractive');
    expect(document.keyPoints.length).toBeGreaterThan(0);
    // Extractive means every bullet is something that was actually said.
    const said = events.map((e) => e.text);
    for (const bullet of document.keyPoints) {
      expect(bullet.evidence.length).toBeGreaterThan(0);
      expect(said.some((text) => text.includes(bullet.evidence[0].quote))).toBe(true);
    }
  });

  it('returns nothing rather than throwing when the host passes rubbish', () => {
    expect(engine.notes('not json')).toBe('');
  });
});
