import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isNativeHost, readMeetingLibrary } from '@excerpt/core';
import type { Meeting } from '@excerpt/types';
import './notes.css';

export function NotesWorkspace({ children, currentId, library }: { children: ReactNode; currentId?: string; library?: Meeting[] }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => { if (library) return; void readMeetingLibrary().then((result) => setMeetings(result.meetings)); }, [currentId, library]);
  const listed = library ?? meetings;
  const filtered = listed.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="notebook">
    <aside className="notebook-sidebar" aria-label="Meeting library">
      <a className="notebook-brand" href="#/">[ e ] <span>excerpt</span></a>
      {!isNativeHost() && <a className="notebook-new" href="#/record"><span>＋</span> New meeting</a>}
      <label className="notebook-search"><span className="sr-only">Search meetings</span><input type="search" placeholder="Search meetings…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <a className={`notebook-all${!currentId ? ' selected' : ''}`} href="#/meetings">All meetings <span>{listed.length}</span></a>
      <div className="notebook-sidebar-label">RECENT</div>
      <div className="notebook-recent">{filtered.map((m) => <a key={m.id} href={`#/m/${m.id}`} className={currentId === m.id ? 'selected' : ''} aria-current={currentId === m.id ? 'page' : undefined}><strong>{m.title}</strong><span>{new Date(m.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {m.processing === 'demo' ? 'Demo' : `${m.items.filter((i) => !i.dismissed).length} notes`}</span></a>)}{filtered.length === 0 && <p>{query ? 'No matching meetings.' : 'Your meetings will appear here.'}</p>}</div>
      <div className="notebook-sidebar-footer"><a href="#/preferences">Preferences ↗</a><span>Stored on this device</span></div>
    </aside>
    <div className="notebook-main">{children}</div>
  </div>;
}
