import { useEffect, useState } from 'react';

export type Route = { name: 'meeting'; id: string } | { name: 'library' } | { name: 'preferences' };

function rewrite(hash: string) {
  try { window.history.replaceState(null, '', `${window.location.pathname}${hash}`); } catch { /* no history */ }
}

/** Only desktop routes are real. Retired browser links deliberately return home. */
export function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('m/') && path.slice(2)) return { name: 'meeting', id: path.slice(2) };
  if (path === 'preferences') return { name: 'preferences' };
  if (path === 'meetings' || path === '') return { name: 'library' };
  rewrite('#/meetings');
  return { name: 'library' };
}

export function useRoute(): [Route, (to: string) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => { const onHash = () => setRoute(parse(window.location.hash)); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  return [route, (to) => { window.location.hash = to; window.scrollTo({ top: 0 }); }];
}
