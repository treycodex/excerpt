import { describe, expect, it } from 'vitest';
import type { TranscriptEvent } from '@excerpt/types';
import { toTurns } from './turns';

const event = (id: string, role: 'you' | 'remote', text: string): TranscriptEvent => ({
  id, sessionId: 'm', role,
  speakerLabel: role === 'you' ? 'YOU' : 'SPEAKER',
  text, isFinal: true, tArrived: 0,
});

describe('transcript turns', () => {
  it('joins consecutive lines from one speaker', () => {
    const turns = toTurns([
      event('a', 'remote', 'Okay.'),
      event('b', 'remote', 'Let’s move the launch.'),
      event('c', 'remote', 'That’s decided.'),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(turns[0]!.id).toBe('a');
  });

  it('starts a new turn when somebody else speaks', () => {
    const turns = toTurns([
      event('a', 'remote', 'Are we agreed?'),
      event('b', 'you', 'Yes.'),
      event('c', 'remote', 'Good.'),
    ]);
    expect(turns.map((t) => t.role)).toEqual(['remote', 'you', 'remote']);
  });

  it('does not merge the same speaker across an interruption', () => {
    // Adjacency makes a turn, not identity — otherwise a conversation collapses into
    // two blocks and stops reading as a conversation.
    const turns = toTurns([
      event('a', 'you', 'I’ll take the deck.'),
      event('b', 'remote', 'Before Friday?'),
      event('c', 'you', 'By Thursday.'),
    ]);
    expect(turns).toHaveLength(3);
  });

  it('handles one event, and none at all', () => {
    expect(toTurns([event('a', 'you', 'Hello.')])).toHaveLength(1);
    expect(toTurns([])).toEqual([]);
  });

  it('never merges two sources that happen to share a label', () => {
    const mislabelled = { ...event('b', 'remote', 'Same words.'), speakerLabel: 'YOU' };
    const turns = toTurns([event('a', 'you', 'Same words.'), mislabelled]);
    expect(turns).toHaveLength(2);
  });
});
