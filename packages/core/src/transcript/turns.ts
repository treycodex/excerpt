import type { SourceRole, TranscriptEvent } from '@excerpt/types';

/**
 * One person speaking without interruption.
 *
 * A transcript arrives as a stream of settled results, and a single sentence often
 * spans several of them. Rendering one row per result means repeating the speaker
 * and the timestamp on every line — tolerable for a 21-line demo, a wall of gutter
 * text for a 45-minute meeting. Grouping them into turns is what makes it readable,
 * and it is the same thing Notes and Messages do with consecutive messages.
 */
export interface Turn {
  /** Stable across renders: the first event's id. */
  id: string;
  speakerLabel: string;
  role: SourceRole;
  events: TranscriptEvent[];
}

/**
 * Adjacent events by the same speaker, in order.
 *
 * Adjacency is what makes a turn, not identity: the same person speaking again after
 * somebody else is a new turn, because that is how a conversation reads. Role is part
 * of the key as well as the label — two sources can carry the same label, and merging
 * across them would be merging across the attribution the whole product rests on.
 */
export function toTurns(events: TranscriptEvent[]): Turn[] {
  const turns: Turn[] = [];

  for (const event of events) {
    const current = turns[turns.length - 1];
    if (current && current.speakerLabel === event.speakerLabel && current.role === event.role) {
      current.events.push(event);
    } else {
      turns.push({
        id: event.id,
        speakerLabel: event.speakerLabel,
        role: event.role,
        events: [event],
      });
    }
  }

  return turns;
}
