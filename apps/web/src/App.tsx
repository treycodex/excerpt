import { useCallback, useEffect, useState } from 'react';
import { applyPreferences, extractItems, loadMeeting, loadPreferences, saveMeeting } from '@excerpt/core';
import type { Meeting, Preferences as Prefs, TranscriptEvent } from '@excerpt/types';
import { Landing } from './views/Landing';
import { Session } from './views/Session';
import { Notes } from './views/Notes';
import { Library } from './views/Library';
import { Preferences } from './views/Preferences';
import { Record } from './views/Record';
import { useRoute } from './router';

export function App() {
  const [route, go] = useRoute();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [missing, setMissing] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [meetingSaveFailed, setMeetingSaveFailed] = useState(false);

  useEffect(() => { void loadPreferences().then(setPrefs); }, [route]);

  useEffect(() => {
    if (route.name !== 'meeting') return;
    if (meeting?.id === route.id) return;
    setMissing(false);
    setMeeting(null);
    // A resolved-but-empty read is "no such meeting", not "still loading". Treating
    // them the same left a stale link on Reading... forever.
    void loadMeeting(route.id).then((m) => {
      setMeeting(m ?? null);
      setMissing(!m);
      setMeetingSaveFailed(false);
    });
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
    try { await saveMeeting(m); setMeetingSaveFailed(false); }
    catch { setMeetingSaveFailed(true); }
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
      case 'record':
        return <Record onSaved={(id) => go(`/m/${id}`)} />;
      case 'meeting':
        if (missing) {
          return (
            <div className="notes">
              <header className="masthead">
                <div className="eyebrow">Excerpt</div>
                <h1>No such meeting</h1>
                <p className="rubric">
                  Meetings live in this browser only, so a link from another device or
                  a cleared browser will not find one. <a href="#/meetings">Your
                  meetings</a> lists what is here.
                </p>
              </header>
            </div>
          );
        }
        if (!meeting || meeting.id !== route.id) {
          return <div className="notes"><p className="rubric">Reading…</p></div>;
        }
        return (
          <Notes
            meeting={prefs ? { ...meeting, items: applyPreferences(meeting.items, prefs) } : meeting}
            prefs={prefs}
            initialSaveFailed={meetingSaveFailed}
            {...(meeting.processing === 'demo' ? { onReplay: () => go('/session') } : {})}
          />
        );
      default:
        return <Landing onStart={() => go('/session')} />;
    }
  })();

  return (
    <>
      <button className="skip-link" onClick={() => document.querySelector<HTMLElement>('#main')?.focus()}>
        Skip to content
      </button>
      <nav className="nav" aria-label="Main">
        <a href="#/" className={route.name === 'landing' ? 'on' : ''}>Excerpt</a>
        <span className="spacer" />
        <a href="#/record" className={route.name === 'record' ? 'on' : ''}>Capture</a>
        <a href="#/meetings" className={route.name === 'library' ? 'on' : ''}>Meetings</a>
        <a href="#/preferences" className={route.name === 'preferences' ? 'on' : ''}>Preferences</a>
        <span className="build" title="Build timestamp">{__BUILD__}</span>
      </nav>
      <main id="main" tabIndex={-1}>{body}</main>
    </>
  );
}
