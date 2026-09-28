import type { MeetingImage, TranscriptEvent } from '@excerpt/types';
import { meetingImageTime, transcriptEventTime } from '../notes/editor';
import { toTurns } from './turns';
import type { Turn } from './turns';

export type TranscriptTimelineEntry =
  | { kind: 'turn'; turn: Turn }
  | { kind: 'image'; image: MeetingImage };

/**
 * Keep captured images at their meeting time, including inside a long speaker turn.
 * Speech results have sentence-level timing rather than word timing, so a capture
 * inside a result follows that whole result. An image with no known meeting time
 * goes at the end instead of pretending its import time was its capture time.
 */
export function transcriptTimeline(events: TranscriptEvent[], images: MeetingImage[] = []): TranscriptTimelineEntry[] {
  const orderedEvents = events.filter((event) => event.isFinal)
    .map((event, index) => ({ event, index }))
    .sort((a, b) => transcriptEventTime(a.event) - transcriptEventTime(b.event) || a.index - b.index)
    .map(({ event }) => event);
  const knownImages = images.filter((image) => image.timeKnown !== false)
    .sort((a, b) => meetingImageTime(a) - meetingImageTime(b) || a.id.localeCompare(b.id));
  const result: TranscriptTimelineEntry[] = [];
  let speech: TranscriptEvent[] = [];
  let imageIndex = 0;
  const flushSpeech = () => {
    result.push(...toTurns(speech).map((turn): TranscriptTimelineEntry => ({ kind: 'turn', turn })));
    speech = [];
  };
  for (const event of orderedEvents) {
    while (imageIndex < knownImages.length
      && meetingImageTime(knownImages[imageIndex]!) < transcriptEventTime(event)) {
      flushSpeech();
      result.push({ kind: 'image', image: knownImages[imageIndex++]! });
    }
    speech.push(event);
  }
  flushSpeech();
  while (imageIndex < knownImages.length) result.push({ kind: 'image', image: knownImages[imageIndex++]! });
  for (const image of images.filter((item) => item.timeKnown === false)) result.push({ kind: 'image', image });
  return result;
}
