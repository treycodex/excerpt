import type { Evidence, TranscriptEvent } from '@excerpt/types';

export interface Sentence {
  /** Verbatim. Evidence quotes and titles always come from this. */
  text: string;
  /**
   * Match against this, never `text`. Speech recognition emits straight quotes but
   * pasted or hand-written transcripts use typographic ones, and a cue pattern
   * written with ' silently fails on '. That mismatch once wiped out every decision
   * and every assignment in the demo script.
   */
  norm: string;
  event: TranscriptEvent;
  index: number;
  evidence?: Evidence[];
}
export type { Assignee } from '@excerpt/types';
