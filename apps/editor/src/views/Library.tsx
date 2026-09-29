import { useEffect, useState } from 'react';
import { readMeetingLibrary, deleteMeeting, renameMeeting } from '@excerpt/core';
import { NotesWorkspace } from './NotesWorkspace';
import type { MeetingLibraryEntry } from '@excerpt/types';

const EMPTY_LIBRARY: MeetingLibraryEntry[] = [];

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Library({ onOpen, onStart, onOpenLiveNotes }: {
  onOpen: (id: string) => void;
  onStart: () => Promise<void>;
  onOpenLiveNotes: () => Promise<void>;
}) {
  const [meetings, setMeetings] = useState<MeetingLibraryEntry[] | null>(null);
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
    <NotesWorkspace library={meetings ?? EMPTY_LIBRARY} libraryAvailable={storageAvailable}><div className="notes notebook-library">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        <h1>Your meetings</h1>
        <p className="rubric">
          Your conversations and screenshots, saved on this Mac. Open a meeting to read its transcript or write notes.
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
          <p>Your first meeting starts here. Read live captions, capture screenshots, and return to the transcript afterwards.</p>
          <div className="actions"><button disabled={commandPending} onClick={() => { void runCommand(onStart); }}>Start meeting</button><button disabled={commandPending} onClick={() => { void runCommand(onOpenLiveNotes); }}>Open live meeting</button></div>
        </div>
      )}

      {/* Above the list, not under it: with a long history the one thing done every
          meeting would otherwise be a scroll away. */}
      {meetings && meetings.length > 0 && <div className="actions"><button disabled={commandPending} onClick={() => { void runCommand(onStart); }}>Start meeting</button><button disabled={commandPending} onClick={() => { void runCommand(onOpenLiveNotes); }}>Open live meeting</button></div>}
      {meetings?.map((m) => {
        return (
          <article className="meeting-row" key={m.id}>
            {renaming === m.id ? (
              <form className="rename" onSubmit={(e) => {
                e.preventDefault();
                void renameMeeting(m.id, title.trim() || m.title)
                  .then(() => { setRenaming(null); setCommandError(''); refresh(); })
                  .catch((error) => setCommandError(error instanceof Error ? error.message : 'Could not rename this meeting. Your title is still here.'));
              }}>
                <input aria-label="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setRenaming(null); } }} />
                <button type="submit">Save</button><button type="button" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : <button className="open" onClick={() => onOpen(m.id)}>
              <span className="mtitle">{m.title} {m.processing === 'demo' && <small>Legacy</small>}</span>
              <span className="mmeta">
                {when(m.startedAt)} · {!m.endedAt && m.draftRevision !== undefined ? 'Live' : m.noteCount > 0 ? 'Transcript + notes' : 'Transcript'}
              </span>
            </button>}
            {pendingDelete === m.id ? (
              <span className="delete-confirm" role="group" aria-label={`Delete “${m.title}”?`}><button autoFocus onClick={() => setPendingDelete(null)}>Keep</button><button className="danger" aria-label={`Delete “${m.title}” now`} onClick={async () => {
                try {
                  await deleteMeeting(m.id); setDeleteError(''); setPendingDelete(null); refresh();
                } catch (error) {
                  setDeleteError(error instanceof Error ? error.message : 'Could not delete that meeting. It was kept.');
                }
              }}>Delete now</button></span>
            ) : (
              <span className="row-actions"><button aria-label={`Rename “${m.title}”`} onClick={() => { setRenaming(m.id); setTitle(m.title); }}>Rename</button><button className="danger" aria-label={`Delete “${m.title}”…`} onClick={() => setPendingDelete(m.id)}>Delete</button></span>
            )}
          </article>
        );
      })}
    </div></NotesWorkspace>
  );
}
