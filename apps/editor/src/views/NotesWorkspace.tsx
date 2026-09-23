import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { readMeetingLibrary, searchMeetingLibrary } from '@excerpt/core';
import type { MeetingLibraryEntry, MeetingSearchResult } from '@excerpt/types';
import { Wordmark } from './Wordmark';
import './notes.css';

/**
 * The second line of a row in the list.
 *
 * A meeting's title already carries its date — "Meeting · Sep 10, 2026 at 4:05 PM" —
 * so repeating it underneath says nothing. Today's meetings show the time instead,
 * which is the part that actually tells two of them apart.
 */
function sublabel(meeting: MeetingLibraryEntry): string {
  const started = new Date(meeting.startedAt);
  const today = new Date().toDateString() === started.toDateString();
  const when = today
    ? started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : started.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!meeting.endedAt && meeting.draftRevision !== undefined) return `${when} · Live`;
  const notes = meeting.noteCount;
  return `${when} · ${meeting.processing === 'demo' ? 'Legacy' : `${notes} ${notes === 1 ? 'note' : 'notes'}`}`;
}

/**
 * Carry the found passage across the navigation, so the meeting opens at it.
 *
 * A route parameter would be the obvious place, but `#/m/<id>` is parsed by
 * slicing the hash (`router.ts`), so anything appended becomes part of the id.
 * Session storage is already how this app hands one route a destination for the
 * next — `excerpt:return-to`, set before going to Preferences.
 */
export const OPEN_AT_KEY = 'excerpt:open-at';

function rememberMatch(match: MeetingSearchResult | undefined) {
  try {
    if (match?.eventId) sessionStorage.setItem(OPEN_AT_KEY, match.eventId);
    else sessionStorage.removeItem(OPEN_AT_KEY);
  } catch { /* the meeting still opens, just not at the passage */ }
}

/** Where the match was found, said plainly. */
const FOUND_IN: Record<MeetingSearchResult['kind'], string> = {
  title: 'title', note: 'in your notes', moment: 'on a captured image', transcript: 'said in the meeting',
};

/**
 * A found passage, with the matched words marked.
 *
 * Built by slicing rather than by regex so the query is never treated as a
 * pattern — a reader searching for "5%" or "(draft)" is searching for those
 * characters.
 */
function Snippet({ match }: { match: MeetingSearchResult }) {
  const { snippet, offset, length } = match;
  return (
    <span className="notebook-snippet">
      <em>{FOUND_IN[match.kind]}</em>{' '}
      {snippet.slice(0, offset)}<mark>{snippet.slice(offset, offset + length)}</mark>{snippet.slice(offset + length)}
    </span>
  );
}

export function NotesWorkspace({ children, currentId, library, libraryAvailable = true }: {
  children: ReactNode; currentId?: string; library?: MeetingLibraryEntry[]; libraryAvailable?: boolean;
}) {
  const [meetings, setMeetings] = useState<MeetingLibraryEntry[]>([]);
  const [readAvailable, setReadAvailable] = useState(true);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{
    query: string; source: MeetingLibraryEntry[] | null; matches: MeetingSearchResult[]; failed: boolean;
  }>({ query: '', source: null, matches: [], failed: false });
  useEffect(() => {
    if (library) return;
    let current = true;
    void readMeetingLibrary().then((result) => {
      if (!current) return;
      setMeetings(result.meetings); setReadAvailable(result.available);
    });
    return () => { current = false; };
  }, [currentId, library]);
  const listed = library ?? meetings;
  const available = library ? libraryAvailable : readAvailable;
  // Deferred so typing stays responsive while native searches persisted text.
  const active = useDeferredValue(query).trim();
  useEffect(() => {
    if (!active || !available) return;
    let current = true;
    const timer = setTimeout(() => {
      void searchMeetingLibrary(active).then((matches) => {
        if (current) setSearch({ query: active, source: listed, matches, failed: false });
      }).catch(() => { if (current) setSearch({ query: active, source: listed, matches: [], failed: true }); });
    }, 120);
    return () => { current = false; clearTimeout(timer); };
  }, [active, available, listed]);
  const searchCurrent = search.query === active && search.source === listed;
  const searching = !!active && !searchCurrent;
  const searchFailed = !!active && searchCurrent && search.failed;
  const matches = searchCurrent && !search.failed ? search.matches : [];
  const filtered = active ? matches.map((m) => m.meeting) : listed;
  const matchOf = useMemo(() => new Map(matches.map((m) => [m.meeting.id, m])), [matches]);
  return <div className="notebook">
    <aside className="notebook-sidebar" aria-label="Meeting library">
      <a className="notebook-brand" href="#/meetings"><Wordmark /></a>
      <label className="notebook-search"><span className="sr-only">Search meetings</span><input type="search" aria-label="Search meetings" placeholder="Search meetings…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      {/* The badge showed the unfiltered total beside a filtered list, so a search
          matching one meeting sat under a count of forty. */}
      <a className={`notebook-all${!currentId ? ' selected' : ''}`} href="#/meetings">
        {active ? 'Matches' : 'All meetings'} <span>{active ? filtered.length : listed.length}</span>
      </a>
      <div className="notebook-sidebar-label">RECENT</div>
      <div className="notebook-recent">{filtered.map((m) => {
        const match = matchOf.get(m.id);
        return (
          <a key={m.id} href={`#/m/${m.id}`} onClick={() => rememberMatch(match)}
            className={currentId === m.id ? 'selected' : ''}
            aria-current={currentId === m.id ? 'page' : undefined}>
            <strong>{m.title}</strong>
            <span>{sublabel(m)}</span>
            {match && match.kind !== 'title' && <Snippet match={match} />}
          </a>
        );
      })}{!available && <p role="status">Meetings could not be read from this Mac’s storage.</p>}{available && searching && <p role="status">Searching meetings…</p>}{available && searchFailed && <p role="status">Search could not be completed. Your meetings were not changed.</p>}{available && !searching && !searchFailed && filtered.length === 0 && <p>{active
        ? 'Nothing found in any title, note, transcript or caption.'
        : 'Your meetings will appear here.'}</p>}</div>
      <div className="notebook-sidebar-footer"><a href="#/preferences">Preferences ↗</a><span>Stored on this device</span></div>
    </aside>
    <div className="notebook-main">{children}</div>
  </div>;
}
