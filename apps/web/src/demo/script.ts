import type { ScriptedLine } from '@excerpt/core';

/**
 * The demo script. ~102 seconds including its closing beat.
 *
 * Every beat earns its place:
 *  - small talk that the extractor correctly ignores
 *  - a genuine proposal ("we could trim it")
 *  - three near-misses a naive cue matcher would call decisions
 *  - one real decision
 *  - an action assigned to YOU by self-commitment, with a deadline
 *  - a request from the other side that Excerpt refuses to attribute
 *  - a question left hanging by a hedged reply
 *  - a question that IS answered, and so does not appear
 */
export const DEMO_SCRIPT: ScriptedLine[] = [
  { at:  3200, role: 'remote', speakerLabel: 'SPEAKER', text: "Alright, I think we're all here. Thanks for turning this round so quickly." },
  { at:  8000, role: 'you',    speakerLabel: 'YOU',     text: 'No problem. I pulled the last four weeks this morning.' },
  { at: 12400, role: 'remote', speakerLabel: 'SPEAKER', text: 'How did the hero film perform?' },
  { at: 16800, role: 'you',    speakerLabel: 'YOU',     text: 'Strong. Completion is up eleven points week on week.' },
  { at: 21600, role: 'remote', speakerLabel: 'SPEAKER', text: 'That’s good to hear. The client did flag one thing.' },
  { at: 27000, role: 'remote', speakerLabel: 'SPEAKER', text: 'They feel the second cut runs long. It loses people before the end card.' },
  { at: 32000, role: 'you',    speakerLabel: 'YOU',     text: 'We could trim it to forty-five seconds.' },
  { at: 36600, role: 'remote', speakerLabel: 'SPEAKER', text: 'What if we moved the launch to October instead?' },
  { at: 41800, role: 'you',    speakerLabel: 'YOU',     text: 'We’ll discuss October next week once media come back with pricing.' },
  { at: 47000, role: 'remote', speakerLabel: 'SPEAKER', text: 'We’re not moving the whole campaign, just the hero spot.' },
  { at: 52400, role: 'remote', speakerLabel: 'SPEAKER', text: 'If legal signs off, we’ll go with the October date.' },
  { at: 57000, role: 'you',    speakerLabel: 'YOU',     text: 'Legal came back yesterday. We’re clear.' },
  { at: 62000, role: 'remote', speakerLabel: 'SPEAKER', text: 'Okay. Let’s move the campaign launch to October. That’s decided.' },
  { at: 67400, role: 'remote', speakerLabel: 'SPEAKER', text: 'Can you send the client the revised deck before Friday?' },
  { at: 72600, role: 'you',    speakerLabel: 'YOU',     text: 'I’ll take the revised deck and get it over by Thursday.' },
  { at: 77800, role: 'remote', speakerLabel: 'SPEAKER', text: 'Do we still need the out-of-home buy?' },
  { at: 82600, role: 'you',    speakerLabel: 'YOU',     text: 'I’m not sure the out-of-home spend is justified yet.' },
  { at: 87000, role: 'remote', speakerLabel: 'SPEAKER', text: 'Fair. Let’s park that for now.' },
  { at: 91400, role: 'you',    speakerLabel: 'YOU',     text: 'I’ll pick this up with media and come back to you.' },
  { at: 95800, role: 'remote', speakerLabel: 'SPEAKER', text: 'Great. Same time next week?' },
  { at: 99600, role: 'you',    speakerLabel: 'YOU',     text: 'Yes, works for me.' },
];
