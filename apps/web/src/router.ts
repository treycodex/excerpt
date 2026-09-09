import { useEffect, useState } from 'react';

export type Route =
  | { name: 'landing' }
  | { name: 'session' }
  | { name: 'meeting'; id: string }
  | { name: 'library' }
  | { name: 'preferences' };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('m/')) return { name: 'meeting', id: path.slice(2) };
  if (path === 'session') return { name: 'session' };
  if (path === 'meetings') return { name: 'library' };
  if (path === 'preferences') return { name: 'preferences' };
  return { name: 'landing' };
}

/** Hash routing, so the back button works and a judge can link to a screen. */
export function useRoute(): [Route, (to: string) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [route, (to: string) => { window.location.hash = to; window.scrollTo({ top: 0 }); }];
}
