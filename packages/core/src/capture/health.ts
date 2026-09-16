/**
 * What one capture source is doing, as a single word.
 *
 * Deliberately platform-neutral and deliberately here rather than in `live.ts`:
 * the browser hears through Web Speech and the Mac through SpeechAnalyzer, but
 * the two questions a person needs answered are identical — is this source being
 * spoken into right now, and is anything coming back from it. Two surfaces
 * answering that differently would be two products.
 *
 * The Swift side mirrors this rule and both are checked against
 * `fixtures/source-health.json`, the same way the extraction engine is.
 */
export type SourceHealth = 'starting' | 'hearing' | 'silent' | 'stalled' | 'failed';

/** Everything the decision needs, in terms any capture backend can report. */
export interface SourceSignals {
  /** The recogniser has started. Before that nothing else means anything. */
  started: boolean;
  /** The source stopped working in a way restarting cannot fix. */
  failed: boolean;
  /** Since a frame on this source was last above the voice threshold. */
  secondsSinceVoiced: number;
  /** Since this source last settled any text. */
  secondsSinceFinal: number;
  /** Voiced audio that has arrived since it last settled any text. */
  voicedSecondsSinceFinal: number;
}

/** How recently a source must have heard a voice to count as hearing one. */
export const HEARING_WINDOW_SECONDS = 4;
/** Voiced audio that must go unrecognised before a source is called stalled. */
export const STALL_VOICED_SECONDS = 8;
/** And how long in wall time, so an ordinary pause never trips it. */
export const STALL_WALL_SECONDS = 30;

/**
 * Both stall conditions are needed.
 *
 * Wall time alone calls a quiet room broken; voiced seconds alone trips on the
 * gap between a long sentence and its final. And the test is rolling rather than
 * "has this source ever produced a result": recognition that works for ten
 * minutes and then dies satisfies "ever" for the rest of the meeting, which is
 * how a capture could go on reporting that it was listening while nothing was
 * being written down.
 */
export function healthOf(signals: SourceSignals): SourceHealth {
  if (signals.failed) return 'failed';
  if (!signals.started) return 'starting';
  if (signals.voicedSecondsSinceFinal >= STALL_VOICED_SECONDS
    && signals.secondsSinceFinal >= STALL_WALL_SECONDS) return 'stalled';
  return signals.secondsSinceVoiced <= HEARING_WINDOW_SECONDS ? 'hearing' : 'silent';
}

/**
 * One line a person can act on, or nothing when the source is fine.
 *
 * `silent` is not a fault and never produces a line: a microphone nobody is
 * talking into is the normal state of a microphone for most of a meeting, and
 * warning about it trains people to ignore the row that carries the real
 * problem.
 */
export function sourceConcern(name: string, health: SourceHealth): string | undefined {
  switch (health) {
    case 'stalled':
      return `${name} is picking up sound, but nothing is being recognised.`;
    case 'failed':
      return `${name} has stopped working. Your notes so far are safe.`;
    default:
      return undefined;
  }
}
