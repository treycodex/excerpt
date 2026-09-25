import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from './router';

const replaced: string[] = [];
beforeEach(() => {
  replaced.length = 0;
  (globalThis as { window?: unknown }).window = {
    location: { pathname: '/', hash: '' },
    history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
  };
});

describe('desktop routes', () => {
  it('keeps only library, meeting, and settings reachable', () => {
    expect(parse('')).toEqual({ name: 'library' });
    expect(parse('#/meetings')).toEqual({ name: 'library' });
    expect(parse('#/m/saved-meeting')).toEqual({ name: 'meeting', id: 'saved-meeting' });
    expect(parse('#/preferences')).toEqual({ name: 'preferences' });
    expect(replaced).toEqual([]);
  });

  it.each(['#/record', '#/session', '#/setup', '#/welcome/m-1', '#/oldlandingpage', '#/get-started'])(
    'returns retired browser route %s to the library', (route) => {
      expect(parse(route)).toEqual({ name: 'library' });
      expect(replaced).toEqual(['/#/meetings']);
    },
  );
});
