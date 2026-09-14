import { useCallback, useEffect, useState } from 'react';
import { applyPreferences, extractItems, isNativeHost, loadMeeting, loadPreferences, saveMeeting } from '@excerpt/core';
import type { Meeting, Preferences as Prefs, TranscriptEvent } from '@excerpt/types';
import { Landing } from './views/Landing';
import { Session } from './views/Session';
import { Notes } from './views/Notes';
import { Library } from './views/Library';
import { Preferences } from './views/Preferences';
import { GetStarted } from './views/GetStarted';
import { NotesWorkspace } from './views/NotesWorkspace';
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
    if (!isNativeHost()) return;
    const receive = (event: Event) => {
      const incoming = (event as CustomEvent<Meeting>).detail;
      if (!incoming?.id) return;
      setMeeting((current) => current?.id === incoming.id ? incoming : current);
    };
    window.addEventListener('excerpt:meeting', receive);
    return () => window.removeEventListener('excerpt:meeting', receive);
  }, []);

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

  // `Session` latches on the first call, so anything thrown in here would leave the
  // demo with no meeting, no navigation, and a Skip button that no longer does
  // anything. Reading preferences is not the only way that happens: `scoreItem` walks
  // `order` and `boosts`, and a stored record with either field null — an older write,
  // or a host payload that spreads over the defaults — throws inside the ranking. So
  // the ranking is attempted and the unranked list is the fallback, rather than the
  // read being guarded and the use of the result left bare.
  const onEnd = useCallback(async (events: TranscriptEvent[]) => {
    const p = await loadPreferences().catch(() => null);
    const items = extractItems(events, new Date());
    const m: Meeting = {
      id: `m-${Date.now()}`,
      title: 'Northside — campaign review',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      processing: 'demo',
      events,
      items: (() => { try { return p ? applyPreferences(items, p) : items; } catch { return items; } })(),
    };
    try { await saveMeeting(m); setMeetingSaveFailed(false); }
    catch { setMeetingSaveFailed(true); }
    setMeeting(m);
    // The notes are what was asked for, so the notes are what opens. Choosing a
    // subtitle style and a review order changes nothing about this document and is
    // not a toll to pay before reading it; Preferences holds both, and the notes
    // page says so once.
    go(`/m/${m.id}`);
  }, [go]);

  const body = (() => {
    switch (route.name) {
      case 'get-started':
        return <GetStarted />;
      case 'session':
        return <Session onEnd={onEnd} />;
      case 'library':
        return <Library onOpen={(id) => go(`/m/${id}`)} />;
      // Capturing and choosing what matters are things you do *in* Excerpt, not
      // things you are sold — so they live in the workspace with the library beside
      // them, like the notes they produce. The marketing pages keep the dark
      // editorial ground; everything past "set up" is the paper one.
      case 'preferences':
        return <NotesWorkspace><Preferences /></NotesWorkspace>;
      case 'record':
        return <NotesWorkspace><Record onSaved={(id) => go(`/m/${id}`)} /></NotesWorkspace>;
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
            key={meeting.id}
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
      {!['landing', 'meeting', 'library', 'get-started', 'record', 'preferences', 'session'].includes(route.name) && <nav className="nav" aria-label="Main">
        <a href="#/">Excerpt</a>
        <span className="spacer" />
        {/* Inside the Mac app, recording is the menu bar's job — this screen asks the
            browser to share a tab, which is not how the Mac hears a meeting. */}
        {!isNativeHost() && (
          <a href="#/record" className={route.name === 'record' ? 'on' : ''}>Record</a>
        )}
        <a href="#/meetings" className={route.name === 'library' ? 'on' : ''}>Meetings</a>
        <a href="#/preferences" className={route.name === 'preferences' ? 'on' : ''}>Preferences</a>
        {/* Build stamp is a debugging aid, not something a visitor should see. */}
        {import.meta.env.DEV && <span className="build" title="Build timestamp">{__BUILD__}</span>}
      </nav>}
      <main id="main" tabIndex={-1}>{body}</main>
    </>
  );
}
