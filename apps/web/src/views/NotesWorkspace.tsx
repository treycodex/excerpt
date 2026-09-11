import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isNativeHost, readMeetingLibrary } from '@excerpt/core';
import type { Meeting } from '@excerpt/types';
import { Wordmark } from './Wordmark';
import './notes.css';

/**
 * The second line of a row in the list.
 *
 * A meeting's title already carries its date — "Meeting · Sep 10, 2026 at 4:05 PM" —
 * so repeating it underneath says nothing. Today's meetings show the time instead,
 * which is the part that actually tells two of them apart.
 */
function sublabel(meeting: Meeting): string {
  const started = new Date(meeting.startedAt);
  const today = new Date().toDateString() === started.toDateString();
  const when = today
    ? started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : started.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!meeting.endedAt && meeting.draftRevision !== undefined) return `${when} · Live`;
  const notes = meeting.items.filter((i) => !i.dismissed).length;
  return `${when} · ${meeting.processing === 'demo' ? 'Demo' : `${notes} ${notes === 1 ? 'note' : 'notes'}`}`;
}

export function NotesWorkspace({ children, currentId, library }: { children: ReactNode; currentId?: string; library?: Meeting[] }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => { if (library) return; void readMeetingLibrary().then((result) => setMeetings(result.meetings)); }, [currentId, library]);
  const listed = library ?? meetings;
  const filtered = listed.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="notebook">
    <aside className="notebook-sidebar" aria-label="Meeting library">
      <a className="notebook-brand" href="#/"><Wordmark /></a>
      {!isNativeHost() && <a className="notebook-new" href="#/record"><span>＋</span> New meeting</a>}
      <label className="notebook-search"><span className="sr-only">Search meetings</span><input type="search" placeholder="Search meetings…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <a className={`notebook-all${!currentId ? ' selected' : ''}`} href="#/meetings">All meetings <span>{listed.length}</span></a>
      <div className="notebook-sidebar-label">RECENT</div>
      <div className="notebook-recent">{filtered.map((m) => <a key={m.id} href={`#/m/${m.id}`} className={currentId === m.id ? 'selected' : ''} aria-current={currentId === m.id ? 'page' : undefined}><strong>{m.title}</strong><span>{sublabel(m)}</span></a>)}{filtered.length === 0 && <p>{query ? 'No matching meetings.' : 'Your meetings will appear here.'}</p>}</div>
      <div className="notebook-sidebar-footer"><a href="#/preferences">Preferences ↗</a><span>Stored on this device</span></div>
    </aside>
    <div className="notebook-main">{children}</div>
  </div>;
}
