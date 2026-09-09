import { useCallback, useEffect, useState } from 'react';
import { applyPreferences, extractItems, loadMeeting, loadPreferences, saveMeeting } from '@excerpt/core';
import type { Meeting, Preferences as Prefs, TranscriptEvent } from '@excerpt/types';
import { Landing } from './views/Landing';
import { Session } from './views/Session';
import { Notes } from './views/Notes';
import { Library } from './views/Library';
import { Preferences } from './views/Preferences';
import { useRoute } from './router';

export function App() {
  const [route, go] = useRoute();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => { void loadPreferences().then(setPrefs); }, [route]);

  useEffect(() => {
    if (route.name !== 'meeting') return;
    void loadMeeting(route.id).then((m) => setMeeting(m ?? null));
  }, [route]);

  const onEnd = useCallback(async (events: TranscriptEvent[]) => {
    const p = await loadPreferences();
    const m: Meeting = {
      id: `m-${Date.now()}`,
      title: 'Northside — campaign review',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      processing: 'demo',
      events,
      items: applyPreferences(extractItems(events, new Date()), p),
    };
    await saveMeeting(m);
    setMeeting(m);
    go(`/m/${m.id}`);
  }, [go]);

  const body = (() => {
    switch (route.name) {
      case 'session':
        return <Session onEnd={onEnd} />;
      case 'library':
        return <Library onOpen={(id) => go(`/m/${id}`)} />;
      case 'preferences':
        return <Preferences />;
      case 'meeting':
        if (!meeting || meeting.id !== route.id) {
          return <div className="notes"><p className="rubric">Reading…</p></div>;
        }
        return (
          <Notes
            meeting={prefs ? { ...meeting, items: applyPreferences(meeting.items, prefs) } : meeting}
            prefs={prefs}
            onReplay={() => go('/session')}
          />
        );
      default:
        return <Landing onStart={() => go('/session')} />;
    }
  })();

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="nav" aria-label="Main">
        <a href="#/" className={route.name === 'landing' ? 'on' : ''}>Excerpt</a>
        <span className="spacer" />
        <a href="#/meetings" className={route.name === 'library' ? 'on' : ''}>Meetings</a>
        <a href="#/preferences" className={route.name === 'preferences' ? 'on' : ''}>Preferences</a>
      </nav>
      <main id="main">{body}</main>
    </>
  );
}
