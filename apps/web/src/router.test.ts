import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from './router';

/**
 * Routing regressions for the journey a first-time visitor takes.
 *
 * The demo used to end on a personalization wizard rather than on the notes it had
 * just produced, and the browser capture entry went through the same detour. These
 * check that the two links that carried it now land on the thing they name, and that
 * the address bar is rewritten rather than left claiming a screen that is gone.
 */
const replaced: string[] = [];
beforeEach(() => {
  replaced.length = 0;
  (globalThis as { window?: unknown }).window = {
    location: { pathname: '/', hash: '' },
    history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
  };
});

describe('routes', () => {
  it('sends a finished meeting straight to its notes', () => {
    expect(parse('#/m/m-1757790000000')).toEqual({ name: 'meeting', id: 'm-1757790000000' });
    expect(replaced).toEqual([]);
  });

  it('opens an old welcome link on that meeting, without the wizard', () => {
    expect(parse('#/welcome/m-1757790000000')).toEqual({ name: 'meeting', id: 'm-1757790000000' });
    expect(replaced).toEqual(['/#/m/m-1757790000000']);
  });

  it('sends an old setup link to audio setup', () => {
    expect(parse('#/setup')).toEqual({ name: 'record' });
    expect(replaced).toEqual(['/#/record']);
  });

  it('does not invent a meeting from a welcome link with no id', () => {
    expect(parse('#/welcome/')).toEqual({ name: 'landing' });
    expect(replaced).toEqual(['/#/']);
  });

  it('keeps the unlisted old landing page reachable by address', () => {
    expect(parse('#/oldlandingpage')).toEqual({ name: 'landing-legacy' });
    // No rewrite: bouncing it to the home page would make the address useless.
    expect(replaced).toEqual([]);
  });

  it('still resolves the screens the rest of the app links to', () => {
    expect(parse('#/record')).toEqual({ name: 'record' });
    expect(parse('#/preferences')).toEqual({ name: 'preferences' });
    expect(parse('#/meetings')).toEqual({ name: 'library' });
    expect(parse('#/session')).toEqual({ name: 'session' });
    expect(parse('#/get-started')).toEqual({ name: 'get-started' });
    expect(parse('')).toEqual({ name: 'landing' });
    expect(replaced).toEqual([]);
  });
});
