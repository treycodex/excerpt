import { useEffect, useState } from 'react';
import { readMeetingLibrary, deleteMeeting, saveMeeting, isNativeHost } from '@excerpt/core';
import { NotesWorkspace } from './NotesWorkspace';
import type { Meeting } from '@excerpt/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const refresh = () => {
    void readMeetingLibrary().then((result) => {
      setMeetings(result.meetings); setStorageAvailable(result.available);
    });
  };
  useEffect(refresh, []);

  return (
    <NotesWorkspace library={meetings ?? []}><div className="notes notebook-library">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        <h1>Your meetings</h1>
        <p className="rubric">
          {isNativeHost()
            ? 'Kept on this Mac only. There is no account and no server — you can open the folder they live in from the Excerpt menu.'
            : 'Stored on this device only. There is no account and no server, so these exist in this browser and nowhere else.'}
        </p>
      </header>

      {meetings === null && <p className="rubric">Reading…</p>}
      {!storageAvailable && (
        <div className="empty-library"><p>This browser’s meeting storage could not be read. Check site-data settings or leave private browsing, then reload.</p></div>
      )}
      {storageAvailable && meetings?.length === 0 && (
        <div className="empty-library">
          <p>Nothing yet. A completed demo or capture will appear here.</p>
          <div className="actions"><a href="#/session">Watch the demo</a><a href="#/record">Capture a meeting</a></div>
        </div>
      )}

      {meetings?.map((m) => {
        const live = m.items.filter((i) => !i.dismissed);
        const decided = live.filter((i) => i.state === 'decided' && i.category === 'decision').length;
        const mine = live.filter((i) => i.assignee === 'you').length;
        return (
          <article className="meeting-row" key={m.id}>
            {renaming === m.id ? (
              <form className="rename" onSubmit={(e) => {
                e.preventDefault();
                const next = { ...m, title: title.trim() || m.title };
                void saveMeeting(next).then(() => { setRenaming(null); refresh(); });
              }}>
                <input aria-label="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                <button type="submit">Save</button><button type="button" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : <button className="open" onClick={() => onOpen(m.id)}>
              <span className="mtitle">{m.title} {m.processing === 'demo' && <small>Demo</small>}</span>
              <span className="mmeta">
                {when(m.startedAt)} · {decided} decided · {mine} assigned to you
              </span>
            </button>}
            {pendingDelete === m.id ? (
              <span className="delete-confirm"><button onClick={() => setPendingDelete(null)}>Keep</button><button className="danger" onClick={async () => { await deleteMeeting(m.id); setPendingDelete(null); refresh(); }}>Delete now</button></span>
            ) : (
              <span className="row-actions"><button onClick={() => { setRenaming(m.id); setTitle(m.title); }}>Rename</button><button className="danger" onClick={() => setPendingDelete(m.id)}>Delete</button></span>
            )}
          </article>
        );
      })}
    </div></NotesWorkspace>
  );
}
