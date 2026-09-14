import { useEffect, useState } from 'react';

export type Route =
  | { name: 'landing' }
  | { name: 'get-started' }
  | { name: 'session' }
  | { name: 'meeting'; id: string }
  | { name: 'library' }
  | { name: 'preferences' }
  | { name: 'record' };

/**
 * Rewrite the address bar without adding a history entry.
 *
 * `replaceState` fires neither `hashchange` nor `popstate`, so the route this call
 * sits inside stays the one that renders — and pressing back from a rewritten URL
 * returns to wherever the visitor came from rather than bouncing off the old link.
 */
function rewrite(hash: string) {
  try { window.history.replaceState(null, '', `${window.location.pathname}${hash}`); }
  catch { /* no history */ }
}

export function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('m/')) return { name: 'meeting', id: path.slice(2) };
  if (path === 'get-started') return { name: 'get-started' };
  if (path === 'session') return { name: 'session' };
  if (path === 'meetings') return { name: 'library' };
  if (path === 'preferences') return { name: 'preferences' };
  if (path === 'record') return { name: 'record' };

  // Two links that used to open the optional personalization wizard. Setting a
  // subtitle style was never required to hear a meeting or to read its notes, so
  // both now land on the thing the visitor actually asked for; the settings live in
  // Preferences. Old bookmarks and shared links keep working rather than 404ing to
  // the home page, and the address bar stops claiming a screen that no longer exists.
  if (path === 'setup') { rewrite('#/record'); return { name: 'record' }; }
  if (path.startsWith('welcome/') && path.length > 'welcome/'.length) {
    const id = path.slice('welcome/'.length);
    rewrite(`#/m/${id}`);
    return { name: 'meeting', id };
  }

  // Anything else is the landing page — but say so in the address bar too. Rendering
  // the home page under a URL that claims to be somewhere else leaves a visitor with
  // a link that does not do what it says when they share it.
  if (path !== '') rewrite('#/');
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
