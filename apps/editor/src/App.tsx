import { useEffect, useState } from 'react';
import { applyPreferences, bridge, isNativeHost, loadMeeting, loadPreferences } from '@excerpt/core';
import type { Meeting, Preferences as Prefs } from '@excerpt/types';
import { Notes } from './views/Notes';
import { Library } from './views/Library';
import { Preferences } from './views/Preferences';
import { NotesWorkspace } from './views/NotesWorkspace';
import { useRoute } from './router';

function DesktopHostError() {
  return <div className="notes"><header className="masthead">
    <div className="eyebrow">Excerpt</div><h1>Open this in Excerpt for Mac</h1>
    <p className="rubric">This editor works with Excerpt’s native meeting storage and capture. It cannot create browser meetings or use browser storage.</p>
  </header></div>;
}

export function App() {
  const [route, go] = useRoute();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [missing, setMissing] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => { void loadPreferences().then(setPrefs).catch(() => setPrefs(null)); }, []);
  useEffect(() => {
    const receive = (event: Event) => {
      const incoming = (event as CustomEvent<Meeting>).detail;
      if (incoming?.id) setMeeting((current) => current?.id === incoming.id ? incoming : current);
    };
    window.addEventListener('excerpt:meeting', receive);
    return () => window.removeEventListener('excerpt:meeting', receive);
  }, []);
  useEffect(() => {
    if (route.name !== 'meeting' || meeting?.id === route.id) return;
    setMissing(false); setMeeting(null);
    void loadMeeting(route.id).then((value) => { setMeeting(value ?? null); setMissing(!value); });
  }, [route, meeting?.id]);

  if (!isNativeHost()) return <DesktopHostError />;
  const host = bridge()!;
  const start = async () => { await host.startMeeting(); };
  const openLiveNotes = async () => { await host.openLiveNotes(); };
  let body;
  if (route.name === 'library') {
    body = <Library onOpen={(id) => go(`/m/${id}`)} onStart={start} onOpenLiveNotes={openLiveNotes} />;
  } else if (route.name === 'preferences') {
    body = <NotesWorkspace><Preferences /></NotesWorkspace>;
  } else if (missing) {
    body = <div className="notes"><header className="masthead"><div className="eyebrow">Excerpt</div><h1>No such meeting</h1><p className="rubric">This meeting is no longer available on this Mac. <a href="#/meetings">Your meetings</a></p></header></div>;
  } else if (!meeting || meeting.id !== route.id) {
    body = <div className="notes"><p className="rubric">Reading…</p></div>;
  } else {
    body = <Notes key={meeting.id} meeting={prefs ? { ...meeting, items: applyPreferences(meeting.items, prefs) } : meeting} prefs={prefs} />;
  }
  return <><button className="skip-link" onClick={() => document.querySelector<HTMLElement>('#main')?.focus()}>Skip to content</button><main id="main" tabIndex={-1}>{body}</main></>;
}
