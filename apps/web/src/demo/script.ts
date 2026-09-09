import type { ScriptedLine } from '@excerpt/core';

/**
 * Starter demo script — agency <-> client campaign review.
 *
 * Deliberately contains near-misses so the extractor can be judged, not merely
 * exercised: a future-discussion ("we'll discuss October next week"), a negation,
 * and a conditional, none of which are decisions. The full ~40-line version is
 * days 12-14 work.
 */
export const DEMO_SCRIPT: ScriptedLine[] = [
  { at:  2200, role: 'remote', speakerLabel: 'SPEAKER', text: 'Thanks for pulling the numbers together.' },
  { at:  5600, role: 'you',    speakerLabel: 'YOU',     text: 'I pulled the last four weeks this morning.' },
  { at: 10400, role: 'remote', speakerLabel: 'SPEAKER', text: 'The hero film is landing well, but the client feels the second cut is too long.' },
  { at: 14200, role: 'remote', speakerLabel: 'SPEAKER', text: 'What if we moved the launch to October?' },
  { at: 18600, role: 'you',    speakerLabel: 'YOU',     text: "We'll discuss October next week once media come back." },
  { at: 23000, role: 'remote', speakerLabel: 'SPEAKER', text: "We're not moving the whole campaign, just the hero spot." },
  { at: 27800, role: 'remote', speakerLabel: 'SPEAKER', text: "If legal signs off, we'll go with the October date." },
  { at: 32400, role: 'remote', speakerLabel: 'SPEAKER', text: "Okay. Let's move the launch to October. That's decided." },
  { at: 36600, role: 'remote', speakerLabel: 'SPEAKER', text: 'Can you send the revised deck before Friday?' },
  { at: 41000, role: 'you',    speakerLabel: 'YOU',     text: "I'll take the revised deck and get it over by Thursday." },
  { at: 45400, role: 'remote', speakerLabel: 'SPEAKER', text: 'Do we still need the out-of-home buy?' },
  { at: 49800, role: 'you',    speakerLabel: 'YOU',     text: "I'm not sure the out-of-home spend is justified yet." },
];
