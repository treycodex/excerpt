import type { TranscriptEvent } from '@excerpt/types';

export interface Sentence {
  text: string;
  event: TranscriptEvent;
  /** Index within the flattened sentence list, for windowed lookahead. */
  index: number;
}
export type { Assignee } from '@excerpt/types';
