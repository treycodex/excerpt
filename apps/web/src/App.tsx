import { useEffect, useState } from 'react';
import { Landing } from './views/Landing';
import { LandingLegacy } from './views/LandingLegacy';

export function App() {
  const [legacy, setLegacy] = useState(() => window.location.hash === '#/oldlandingpage');
  useEffect(() => {
    const route = () => setLegacy(window.location.hash === '#/oldlandingpage');
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);

  const showDemo = () => {
    if (legacy) window.location.hash = '#/';
    window.setTimeout(() => {
      document.getElementById('tab-subtitles')?.click();
      document.getElementById('lp-frame')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  return <main id="main" tabIndex={-1}>
    {legacy ? <><p className="legacy-notice">Archived landing-page design. <a href="#/">See the current transcript-first product →</a></p><LandingLegacy onStart={showDemo} /></> : <Landing onStart={showDemo} />}
  </main>;
}
