import { useEffect, useState } from 'react';
import { listMeetings, deleteMeeting } from '@excerpt/core';
import type { Meeting } from '@excerpt/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  const refresh = () => { void listMeetings().catch(() => []).then(setMeetings); };
  useEffect(refresh, []);

  return (
    <div className="notes">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        <h1>Your meetings</h1>
        <p className="rubric">
          Stored on this device only. There is no account and no server, so these exist
          in this browser and nowhere else.
        </p>
      </header>

      {meetings === null && <p className="rubric">Reading…</p>}
      {meetings?.length === 0 && (
        <p className="rubric">Nothing yet. Watch the demo and it will appear here.</p>
      )}

      {meetings?.map((m) => {
        const live = m.items.filter((i) => !i.dismissed);
        const decided = live.filter((i) => i.state === 'decided' && i.category === 'decision').length;
        const mine = live.filter((i) => i.assignee === 'you').length;
        return (
          <article className="meeting-row" key={m.id}>
            <button className="open" onClick={() => onOpen(m.id)}>
              <span className="mtitle">{m.title}</span>
              <span className="mmeta">
                {when(m.startedAt)} · {decided} decided · {mine} assigned to you
              </span>
            </button>
            <button
              className="danger"
              onClick={async () => { await deleteMeeting(m.id); refresh(); }}
            >
              Delete
            </button>
          </article>
        );
      })}
    </div>
  );
}
