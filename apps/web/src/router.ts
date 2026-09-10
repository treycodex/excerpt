import { useEffect, useState } from 'react';

export type Route =
  | { name: 'landing' }
  | { name: 'get-started' }
  | { name: 'setup' }
  | { name: 'session' }
  | { name: 'meeting'; id: string }
  | { name: 'library' }
  | { name: 'preferences' }
  | { name: 'record' }
  | { name: 'onboarding'; id: string };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('m/')) return { name: 'meeting', id: path.slice(2) };
  if (path === 'get-started') return { name: 'get-started' };
  if (path === 'setup') return { name: 'setup' };
  if (path === 'session') return { name: 'session' };
  if (path === 'meetings') return { name: 'library' };
  if (path === 'preferences') return { name: 'preferences' };
  if (path === 'record') return { name: 'record' };
  if (path.startsWith('welcome/')) return { name: 'onboarding', id: path.slice(8) };

  // Anything else is the landing page — but say so in the address bar too. Rendering
  // the home page under a URL that claims to be somewhere else leaves a visitor with
  // a link that does not do what it says when they share it.
  if (path !== '') {
    try { window.history.replaceState(null, '', `${window.location.pathname}#/`); } catch { /* no history */ }
  }
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
