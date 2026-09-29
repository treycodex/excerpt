import { useEffect, useState } from 'react';
import { DemoModal } from './views/DemoModal';
import { InstallPage } from './views/Install';
import { Landing } from './views/Landing';
import { LandingLegacy } from './views/LandingLegacy';

type Route = 'landing' | 'legacy' | 'install';

/* Hash routes, so every page is one static file with no server rewrites. */
const routeOf = (hash: string): Route =>
  hash === '#/oldlandingpage' ? 'legacy' : hash === '#/install' ? 'install' : 'landing';

const TITLES: Partial<Record<Route, string>> = { install: 'Install Excerpt for Mac' };
const DEFAULT_TITLE = document.title;

export function App() {
  const [route, setRoute] = useState(() => routeOf(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setRoute(routeOf(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.title = TITLES[route] ?? DEFAULT_TITLE; }, [route]);

  // "Watch the demo" plays the film, wherever on the site it is pressed.
  const [demo, setDemo] = useState(false);
  const showDemo = () => setDemo(true);

  return <main id="main" tabIndex={-1}>
    {route === 'legacy'
      ? <><p className="legacy-notice">Archived landing-page design. <a href="#/">See the current transcript-first product →</a></p><LandingLegacy onStart={showDemo} /></>
      : route === 'install' ? <InstallPage /> : <Landing onStart={showDemo} />}
    <DemoModal open={demo} onClose={() => setDemo(false)} />
  </main>;
}
