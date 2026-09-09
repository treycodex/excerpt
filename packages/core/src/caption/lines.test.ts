import { describe, expect, it } from 'vitest';
import { splitIntoSubtitleLines } from './lines';

describe('splitIntoSubtitleLines', () => {
  it('leaves short text on one line', () => {
    expect(splitIntoSubtitleLines('Let us lock October.')).toEqual(['Let us lock October.']);
  });

  it('never exceeds two lines', () => {
    const long = 'we are not moving the whole campaign just the hero spot and if legal signs off we will go with the October date';
    expect(splitIntoSubtitleLines(long).length).toBeLessThanOrEqual(2);
  });

  it('respects the character budget', () => {
    const out = splitIntoSubtitleLines('Can you send the revised deck before Friday please', { maxChars: 30 });
    for (const line of out) expect(line.length).toBeLessThanOrEqual(30);
  });

  it('prefers breaking after punctuation over balancing', () => {
    // maxChars must leave room for the remainder, or the split is not a legal option.
    const [first] = splitIntoSubtitleLines('Okay, let us move the launch to October.', { maxChars: 36 });
    expect(first).toBe('Okay,');
  });

  it('prefers starting a line with a conjunction over splitting a phrase', () => {
    const out = splitIntoSubtitleLines('the hero film is landing well but the second cut is too long', { maxChars: 34 });
    expect(out[1]?.startsWith('but')).toBe(true);
  });

  it('keeps the tail when text cannot fit in two lines', () => {
    const out = splitIntoSubtitleLines('one two three four five six seven eight nine ten eleven twelve', { maxChars: 12 });
    expect(out.join(' ')).toContain('twelve');
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('does not strand a determiner when another split is legal', () => {
    // Both "...feels | the second..." and "...feels the | second..." fit in 30 chars.
    // The determiner penalty must pick the first.
    const out = splitIntoSubtitleLines(
      'but the client feels the second cut is too long', { maxChars: 30 });
    expect(out[0]?.endsWith('the')).toBe(false);
    expect(out[1]?.startsWith('the')).toBe(true);
  });

  it('accepts a stranded determiner when it is the ONLY legal split', () => {
    // Documented limit: at 42 chars this sentence has exactly one split that fits,
    // so the penalty cannot override it. Two lines is a hard design cap.
    const out = splitIntoSubtitleLines(
      'The hero film is landing well, but the client feels the second cut is too long.');
    expect(out).toHaveLength(2);
    expect(out.join(' ').replace(/\s+/g, ' ')).toContain('client feels');
  });

  it('does not split a premodifier from its noun', () => {
    const out = splitIntoSubtitleLines("We'll discuss October next week once media come back.");
    expect(out[0]?.endsWith('next')).toBe(false);
  });

  it('terminates on unsplittable text instead of blowing the stack', () => {
    const out = splitIntoSubtitleLines('one two three four five six seven eight nine ten eleven twelve', { maxChars: 12 });
    expect(out.length).toBeLessThanOrEqual(2);
    for (const line of out) expect(line.length).toBeLessThanOrEqual(12);
  });

  it('hard-slices a single word longer than the budget', () => {
    const out = splitIntoSubtitleLines('Antidisestablishmentarianism', { maxChars: 10 });
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[0]).toBe('Antidisest');
  });

  it('returns nothing for empty input', () => {
    expect(splitIntoSubtitleLines('   ')).toEqual([]);
  });
});
