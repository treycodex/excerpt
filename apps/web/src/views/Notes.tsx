import { useMemo, useRef, useState } from 'react';
import { saveMeeting, toMarkdown } from '@excerpt/core';
import type { Category, Item, Meeting } from '@excerpt/types';

const clock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const HEADING: Record<Category, string> = {
  decision: 'Decisions',
  action: 'Action items',
  deadline: 'Deadlines',
  question: 'Open questions',
};
const ORDER: Category[] = ['decision', 'action', 'deadline', 'question'];

export function Notes({ meeting: initial }: { meeting: Meeting }) {
  const [meeting, setMeeting] = useState(initial);
  const [focused, setFocused] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});

  /** Every correction persists immediately. Edits are the user's, not suggestions. */
  const update = (id: string, patch: Partial<Item>) => {
    const next = {
      ...meeting,
      items: meeting.items.map((i) => (i.id === id ? { ...i, ...patch, userEdited: true } : i)),
    };
    setMeeting(next);
    void saveMeeting(next);
  };

  const live = meeting.items.filter((i) => !i.dismissed);
  const decided = live.filter((i) => i.state === 'decided' && i.category === 'decision');
  const mine = live.filter((i) => i.assignee === 'you');
  const review = live.filter((i) => i.category === 'action' && i.assignee === 'unassigned');
  const dismissed = meeting.items.filter((i) => i.dismissed);

  const grouped = useMemo(
    () => ORDER.map((c) => [c, live.filter((i) => i.category === c)] as const).filter(([, g]) => g.length),
    [live],
  );

  const reveal = (eventId: string) => {
    setFocused(eventId);
    rows.current[eventId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(meeting));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const download = () => {
    const blob = new Blob([toMarkdown(meeting)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meeting.title.replace(/\W+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="notes">
      <header>
        <h1>{meeting.title}</h1>
        <dl className="credits">
          <dt>Attendees</dt><dd>You + 1 other</dd>
          <dt>Duration</dt><dd>{clock(meeting.events.at(-1)?.tArrived ?? 0)}</dd>
          <dt>Decided</dt><dd>{decided.length}</dd>
          <dt>Assigned to you</dt><dd>{mine.length}</dd>
          <dt>Needs review</dt><dd>{review.length}</dd>
          <dt>Processing</dt><dd>{meeting.processing}</dd>
        </dl>
        <div className="actions">
          <button onClick={copy}>{copied ? 'Copied' : 'Copy Markdown'}</button>
          <button onClick={download}>Download .md</button>
        </div>
      </header>

      {grouped.map(([category, group]) => (
        <section key={category}>
          <h2>{HEADING[category]}</h2>
          {group.map((item) => (
            <ItemCard key={item.id} item={item} onReveal={reveal} onUpdate={update} />
          ))}
        </section>
      ))}

      {review.length > 0 && (
        <section>
          <h2>Needs review</h2>
          <p className="empty">
            Excerpt heard these but cannot tell who they were addressed to. It will not
            guess.
          </p>
        </section>
      )}

      {dismissed.length > 0 && (
        <section>
          <h2>Dismissed</h2>
          {dismissed.map((i) => (
            <div className="dismissed-row" key={i.id}>
              <span>{i.title}</span>
              <button onClick={() => update(i.id, { dismissed: false })}>Restore</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>Transcript</h2>
        <p className="empty">
          Timings are approximate — measured when text arrived, not from audio.
        </p>
        {meeting.events.map((e) => (
          <div
            key={e.id}
            ref={(el) => { rows.current[e.id] = el; }}
            className={`line-row${focused === e.id ? ' focused' : ''}`}
          >
            <span className="meta">{e.speakerLabel} ~{clock(e.tArrived)}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function ItemCard({
  item, onReveal, onUpdate,
}: {
  item: Item;
  onReveal: (eventId: string) => void;
  onUpdate: (id: string, patch: Partial<Item>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);

  return (
    <article className={`item${item.state === 'decided' ? ' decided' : ''}`}>
      <div className="state">
        {item.state}
        {item.assignee === 'you' && <span className="mine"> · assigned to you</span>}
        {item.due && <span className="due"> · due {item.due}</span>}
        {item.userEdited && <span className="edited"> · edited</span>}
      </div>

      {editing ? (
        <div className="edit">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <button onClick={() => { onUpdate(item.id, { title: draft }); setEditing(false); }}>Save</button>
          <button onClick={() => { setDraft(item.title); setEditing(false); }}>Cancel</button>
        </div>
      ) : (
        <div className="title" onClick={() => item.evidence[0] && onReveal(item.evidence[0].eventIds[0]!)}>
          {item.title}
        </div>
      )}

      {item.evidence.map((e, i) => (
        <blockquote key={i} onClick={() => onReveal(e.eventIds[0]!)}>
          {e.quote}
          <cite>{e.speakerLabel} · ~{clock(e.tArrived)}</cite>
        </blockquote>
      ))}

      <div className="controls">
        <button onClick={() => setEditing(true)}>Edit</button>
        {item.assignee === 'unassigned'
          ? <button onClick={() => onUpdate(item.id, { assignee: 'you' })}>Assign to me</button>
          : <button onClick={() => onUpdate(item.id, { assignee: 'unassigned' })}>Unassign</button>}
        <select
          value={item.category}
          onChange={(e) => onUpdate(item.id, { category: e.target.value as Category })}
        >
          {ORDER.map((c) => <option key={c} value={c}>{HEADING[c]}</option>)}
        </select>
        <button onClick={() => onUpdate(item.id, { dismissed: true })}>Dismiss</button>
      </div>
    </article>
  );
}
