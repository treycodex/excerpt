import { useEffect, useState } from 'react';
import { readMeetingLibrary, deleteMeeting, saveMeeting } from '@excerpt/core';
import { NotesWorkspace } from './NotesWorkspace';
import type { Meeting } from '@excerpt/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Library({ onOpen, onStart, onOpenLiveNotes }: {
  onOpen: (id: string) => void;
  onStart: () => Promise<void>;
  onOpenLiveNotes: () => Promise<void>;
}) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [commandError, setCommandError] = useState('');
  const [commandPending, setCommandPending] = useState(false);
  const runCommand = async (command: () => Promise<void>) => {
    setCommandPending(true); setCommandError('');
    try { await command(); }
    catch (error) { setCommandError(error instanceof Error ? error.message : 'Could not complete that action. Try the Excerpt menu.'); }
    finally { setCommandPending(false); }
  };

  const refresh = () => {
    void readMeetingLibrary().then((result) => {
      setMeetings(result.meetings); setStorageAvailable(result.available);
    }).catch(() => { setMeetings([]); setStorageAvailable(false); });
  };
  useEffect(refresh, []);

  return (
    <NotesWorkspace library={meetings ?? []}><div className="notes notebook-library">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        <h1>Your meetings</h1>
        <p className="rubric">
          Kept on this Mac. There is no account; optional OpenAI note enhancement is configured separately in Preferences.
        </p>
      </header>

      {meetings === null && <p className="rubric">Reading…</p>}
      {commandError && <p role="alert">{commandError}</p>}
      {deleteError && <p className="rubric" role="alert">{deleteError}</p>}
      {!storageAvailable && (
        <div className="empty-library"><p>This Mac’s meeting storage could not be read. Your saved meetings were left unchanged; reopen Excerpt or check the storage location.</p></div>
      )}
      {storageAvailable && meetings?.length === 0 && (
        <div className="empty-library">
          <p>Nothing yet. Start a meeting to capture captions and moments.</p>
          <div className="actions"><button disabled={commandPending} onClick={() => { void runCommand(onStart); }}>Start meeting</button><button disabled={commandPending} onClick={() => { void runCommand(onOpenLiveNotes); }}>Open live notes</button></div>
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
                void saveMeeting(next).then(() => { setRenaming(null); setCommandError(''); refresh(); })
                  .catch((error) => setCommandError(error instanceof Error ? error.message : 'Could not rename this meeting. Your title is still here.'));
              }}>
                <input aria-label="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                <button type="submit">Save</button><button type="button" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : <button className="open" onClick={() => onOpen(m.id)}>
              <span className="mtitle">{m.title} {m.processing === 'demo' && <small>Legacy</small>}</span>
              <span className="mmeta">
                {when(m.startedAt)} · {decided} decided · {mine} assigned to you
              </span>
            </button>}
            {pendingDelete === m.id ? (
              <span className="delete-confirm"><button onClick={() => setPendingDelete(null)}>Keep</button><button className="danger" onClick={async () => {
                try {
                  await deleteMeeting(m.id); setDeleteError(''); setPendingDelete(null); refresh();
                } catch (error) {
                  setDeleteError(error instanceof Error ? error.message : 'Could not delete that meeting. It was kept.');
                }
              }}>Delete now</button></span>
            ) : (
              <span className="row-actions"><button onClick={() => { setRenaming(m.id); setTitle(m.title); }}>Rename</button><button className="danger" onClick={() => setPendingDelete(m.id)}>Delete</button></span>
            )}
          </article>
        );
      })}
      {meetings && meetings.length > 0 && <div className="actions"><button disabled={commandPending} onClick={() => { void runCommand(onStart); }}>Start meeting</button><button disabled={commandPending} onClick={() => { void runCommand(onOpenLiveNotes); }}>Open live notes</button></div>}
    </div></NotesWorkspace>
  );
}
