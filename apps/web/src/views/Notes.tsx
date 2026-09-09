import { useRef, useState } from 'react';
import { toMarkdown } from '@excerpt/core';
import type { Meeting } from '@excerpt/types';

const clock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function Notes({ meeting }: { meeting: Meeting }) {
  const [focused, setFocused] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});

  const live = meeting.items.filter((i) => !i.dismissed);
  const decided = live.filter((i) => i.state === 'decided');

  // Motif 2: clicking an item moves to the passage it came from. Nothing plays —
  // there is no audio, so this navigates the transcript.
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
          <dt>Processing</dt><dd>{meeting.processing}</dd>
        </dl>
        <div className="actions">
          <button onClick={copy}>{copied ? 'Copied' : 'Copy Markdown'}</button>
          <button onClick={download}>Download .md</button>
        </div>
      </header>

      <section>
        <h2>Decisions</h2>
        {!live.length && <p className="empty">Nothing was settled in this meeting.</p>}
        {live.map((item) => (
          <article
            key={item.id}
            className={`item${item.state === 'decided' ? ' decided' : ''}`}
            onClick={() => item.evidence[0] && reveal(item.evidence[0].eventIds[0]!)}
          >
            <div className="state">{item.state}</div>
            <div className="title">{item.title}</div>
            {item.evidence.map((e, i) => (
              <blockquote key={i}>
                {e.quote}
                <cite>{e.speakerLabel} · ~{clock(e.tArrived)}</cite>
              </blockquote>
            ))}
          </article>
        ))}
      </section>

      <section>
        <h2>Transcript</h2>
        <p className="empty">Timings are approximate — measured when text arrived, not from audio.</p>
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
