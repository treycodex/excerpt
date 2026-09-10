import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { NotesWorkspace } from './NotesWorkspace';
import { applyPreferences, bridge, matchedBoosts, orderCategories, saveMeeting, toMarkdown, toTurns } from '@excerpt/core';
import { Frame, Strip } from '@excerpt/ui';
import type { StripMark } from '@excerpt/ui';
import type { Category, Item, Meeting, Preferences as Prefs } from '@excerpt/types';

const clock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * A timestamp, and whether it may be stated exactly.
 *
 * `tStart` is where the words actually are in the audio; macOS reports one for every
 * result. `tArrived` is when the text turned up, which lags real speech by however
 * long recognition took — the Web Speech API offers nothing better. The tilde is the
 * difference, and dropping it where it is no longer true matters more than keeping
 * one code path.
 */
const stamp = (source: { tStart?: number; tArrived: number }) =>
  source.tStart !== undefined
    ? clock(source.tStart * 1000)
    : `~${clock(source.tArrived)}`;

const HEADING: Record<Category, string> = {
  decision: 'Decisions',
  action: 'Action items',
  deadline: 'Deadlines',
  question: 'Open questions',
};
const ORDER: Category[] = ['decision', 'action', 'deadline', 'question'];
type ItemPatch = Omit<Partial<Item>, 'due'> & { due?: string | undefined };

export function Notes({ meeting: initial, prefs, onReplay, initialSaveFailed = false }:
  { meeting: Meeting; prefs?: Prefs | null; onReplay?: () => void; initialSaveFailed?: boolean }) {
  const [meeting, setMeeting] = useState(initial);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [focusedEvent, setFocusedEvent] = useState<string | null>(null);
  const [position, setPosition] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [tab, setTab] = useState<'notes' | 'transcript'>('notes');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>(initialSaveFailed ? 'failed' : 'saved');
  const rows = useRef<Record<string, HTMLDivElement | null>>({});
  const cards = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (initial.id !== meeting.id) setMeeting(initial);
  }, [initial.id, meeting.id]);

  const update = (id: string, patch: ItemPatch) => {
    const next = {
      ...meeting,
      items: meeting.items.map((i): Item => {
        if (i.id !== id) return i;
        const updated = { ...i, ...patch, userEdited: true } as Item & { due?: string | undefined };
        if ('due' in patch && !patch.due) delete updated.due;
        return updated;
      }),
    };
    setMeeting(next);
    setSaveState('saving');
    void saveMeeting(next).then(() => setSaveState('saved')).catch(() => setSaveState('failed'));
  };

  const visible = meeting.items.filter((i) => !i.dismissed);
  const live = prefs ? applyPreferences(visible, prefs) : visible;
  const duration = meeting.events.at(-1)?.tArrived ?? 1;
  const decided = live.filter((i) => i.state === 'decided' && i.category === 'decision');
  const mine = live.filter((i) => i.assignee === 'you');
  const review = live.filter((i) => i.category === 'action' && i.assignee === 'unassigned');
  const dismissed = meeting.items.filter((i) => i.dismissed);

  // Sections follow the user's stated order; ordering never hides anything.
  const sectionOrder = prefs ? orderCategories(prefs) : ORDER;


  const grouped = useMemo(
    () => sectionOrder.map((c) => [c, live.filter((i) => i.category === c)] as const)
      .filter(([, g]) => g.length),
    [live, sectionOrder.join(',')],
  );

  // Stagger follows the order items are actually drawn in, not their salience rank —
  // otherwise the cascade jumps around the page instead of running down it.
  const visualOrder = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const [, group] of grouped) for (const item of group) map.set(item.id, i++);
    return map;
  }, [grouped]);

  const marks: StripMark[] = live.map((i) => ({
    id: i.id,
    at: i.evidence[0]?.tArrived ?? 0,
    settled: i.state === 'decided',
    label: i.title,
  }));

  const scrollBehavior = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const;

  /** One gesture: select an item, move the playhead, frame its passage. */
  const selectItem = (id: string) => {
    const item = meeting.items.find((i) => i.id === id);
    const ev = item?.evidence[0];
    if (!ev) return;
    setTab('notes');
    setActiveItem(id);
    setPosition(ev.tArrived);
    setFocusedEvent(ev.eventIds[0] ?? null);
    cards.current[id]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  const revealEvidence = (itemId: string, eventId: string, at: number) => {
    setActiveItem(itemId);
    setPosition(at);
    setFocusedEvent(eventId);
    cards.current[itemId]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  const openTranscript = (eventId: string) => {
    setFocusedEvent(eventId);
    setTab('transcript');
  };

  useEffect(() => {
    if (tab === 'transcript' && focusedEvent) rows.current[focusedEvent]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  }, [tab, focusedEvent]);

  useEffect(() => {
    if (tab === 'notes' && activeItem) cards.current[activeItem]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  }, [tab, activeItem]);

  /** Scrubbing the rail lands on the nearest thing actually said. */
  const scrub = (ms: number) => {
    if (!meeting.events.length) return;
    setTab('transcript');
    setPosition(ms);
    const nearest = meeting.events.reduce((best, e) =>
      Math.abs(e.tArrived - ms) < Math.abs(best.tArrived - ms) ? e : best, meeting.events[0]!);
    setFocusedEvent(nearest.id);
    rows.current[nearest.id]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown({ ...meeting, items: [...live, ...dismissed] }));
      setCopyFailed(false); setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { setCopyFailed(true); }
  };

  const download = () => {
    const markdown = toMarkdown({ ...meeting, items: [...live, ...dismissed] });
    const filename = `${meeting.title.replace(/\W+/g, '-').toLowerCase()}.md`;

    // Inside Excerpt's own window a browser download goes somewhere the user cannot
    // find, which reads as the export having failed. The host opens a real save panel.
    const host = bridge();
    if (host) { void host.exportMarkdown(filename, markdown); return; }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <NotesWorkspace currentId={meeting.id}>
    <div className="notebook-toolbar"><a href="#/meetings">All meetings <span>/</span> Meeting notes</a><div><span className={`save-state ${saveState}`} role="status">{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved — export a copy' : 'Saved on this device'}</span><button onClick={copy}>{copied ? 'Copied ✓' : 'Copy notes'}</button><button onClick={download}>Export ↗</button></div></div>
    <div className="notes notes-reading">
      <header className="masthead">
        <div className="notebook-date">{new Date(meeting.startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} <span>·</span> {clock(duration)} <span>·</span> {meeting.processing === 'demo' ? 'Demo meeting' : meeting.processing === 'cloud' ? 'Cloud transcription' : 'On-device transcription'}</div>
        <h1>{meeting.title}</h1>
        <p className="notebook-description">Your conversation, with the important parts ready to revisit.</p>
        <div className="note-counts" aria-label="Meeting note counts"><span><b>{decided.length}</b> decisions</span><span><b>{mine.length}</b> assigned to you</span><span><b>{review.length}</b> to assign</span></div>
        {copyFailed && <p role="status" className="rubric">Could not copy to the clipboard. Use Export to save your notes.</p>}
        <div className="notebook-tabs" role="group" aria-label="Meeting view"><button aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>Notes <span>{live.length}</span></button><button aria-pressed={tab === 'transcript'} onClick={() => setTab('transcript')}>Transcript <span>{meeting.events.length}</span></button>{onReplay && <button className="notebook-replay" onClick={onReplay}>▷ Replay demo</button>}</div>
        <details className="notebook-timeline"><summary>Explore meeting timeline</summary><Strip duration={duration} position={position} marks={marks} onScrub={scrub} onSelect={selectItem} /><p className="rubric">{meeting.events.some((e) => e.tStart !== undefined) ? 'Select a marker to see its note and source passage.' : 'Select a marker to see its note. Transcript timings are approximate.'}</p></details>
      </header>
      <div hidden={tab !== 'notes'}>
      {live.length === 0 && (
        <section className="empty-notes">
          <h2>No structured notes found</h2>
          <p>Excerpt could not identify a clear decision, action, deadline, or open question. Open the Transcript tab to read what was captured.</p>
        </section>
      )}

      {grouped.map(([category, group]) => (
        <section key={category}>
          <h2>{HEADING[category]}</h2>
          {group.map((item) => (
            <div
              key={item.id}
              ref={(el) => { cards.current[item.id] = el; }}
              style={{ '--stagger': `${Math.min(visualOrder.get(item.id) ?? 0, 6) * 45}ms` } as CSSProperties}
            >
              <ItemCard
                item={item}
                active={activeItem === item.id}
                context={activeItem === item.id ? transcriptContext(meeting, item) : []}
                boosts={prefs ? matchedBoosts(item, prefs) : []}
                onEvidence={revealEvidence}
                onFullTranscript={openTranscript}
                onUpdate={update}
              />
            </div>
          ))}
        </section>
      ))}

      {(!prefs || !prefs.instruction) && live.length > 0 && (
        <p className="rubric nudge">
          Notes use the default order. <a href="#/preferences">Choose what matters to you</a> to rank them using visible, editable terms.
        </p>
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

      </div>
      {/* No heading: the segmented control directly above already says Transcript.
          Turns rather than lines — one speaker label per stretch of speech, because a
          settled result is not a unit anybody reads in. */}
      <section className="transcript" hidden={tab !== 'transcript'}>
        {meeting.events.length === 0 && <p className="rubric">No transcript was captured for this meeting.</p>}
        {toTurns(meeting.events).map((turn) => (
          <article className={`turn${turn.role === 'you' ? ' mine' : ''}`} key={turn.id}>
            <header>
              <span className="who">{turn.speakerLabel}</span>
              <span className="at">{stamp(turn.events[0]!)}</span>
            </header>
            <div className="said">
              {turn.events.map((e) => (
                <p
                  key={e.id}
                  ref={(el) => { rows.current[e.id] = el; }}
                  className={`line-row${focusedEvent === e.id ? ' focused' : ''}`}
                >
                  {e.text}
                </p>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
    </NotesWorkspace>
  );
}

function ItemCard({
  item, active, context, boosts, onEvidence, onFullTranscript, onUpdate,
}: {
  item: Item;
  active: boolean;
  context: Meeting['events'];
  boosts: string[];
  onEvidence: (itemId: string, eventId: string, at: number) => void;
  onFullTranscript: (eventId: string) => void;
  onUpdate: (id: string, patch: ItemPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);

  return (
    <Frame active={active}>
      <article className={`item${item.state === 'decided' ? ' decided' : ''}`}>
        <div className="state">
          {/* discussed/proposed/decided only means something for a decision. An
              action labelled "decided" reads as nonsense, and an unanswered
              question labelled "discussed" reads as wrong. */}
          {item.category === 'decision' && <span className="badge">{item.state}</span>}
          {item.category === 'question' && <span className="badge open">open</span>}
          {item.category === 'deadline' && <span className="badge">deadline</span>}
          {item.assignee === 'you' && <span className="mine">assigned to you</span>}
          {item.category === 'action' && item.assignee === 'unassigned' && (
            <span className="review" title="Excerpt cannot tell who this was addressed to, so it will not guess.">
              who's doing this?
            </span>
          )}
          {item.due && <span className="due">due {item.due}</span>}
          {item.userEdited && <span className="edited">edited</span>}
          {/* Show which of the user's own terms lifted this item, so the ranking
              is inspectable rather than mysterious. */}
          {boosts.length > 0 && <span className="boosted">you asked about {boosts.join(', ')}</span>}
        </div>

        {editing ? (
          <div className="edit">
            <input aria-label="Note title" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <button onClick={() => { onUpdate(item.id, { title: draft }); setEditing(false); }}>Save</button>
            <button onClick={() => { setDraft(item.title); setEditing(false); }}>Cancel</button>
          </div>
        ) : (
          <h3 className="title">{item.title}</h3>
        )}

        <details className="note-evidence" open={active || undefined}><summary>Source · {item.evidence[0] ? stamp(item.evidence[0]) : 'No passage'}</summary>
        {item.evidence.map((e, i) => (
          <blockquote key={i}>
            {e.quote}
            <cite>{e.speakerLabel} · {stamp(e)}</cite>
            <button className="view-passage" onClick={() => onEvidence(item.id, e.eventIds[0]!, e.tArrived)}>
              View passage
            </button>
          </blockquote>
        ))}

        {active && context.length > 0 && (
          <div className="passage-context" role="region" aria-label="Source passage">
            <div className="passage-label">Source passage</div>
            {context.map((event) => (
              <p key={event.id} className={item.evidence.some((e) => e.eventIds.includes(event.id)) ? 'source' : ''}>
                <span>{event.speakerLabel} · {stamp(event)}</span>{event.text}
              </p>
            ))}
            <button onClick={() => onFullTranscript(item.evidence[0]?.eventIds[0] ?? '')}>View in full transcript</button>
          </div>
        )}

        </details>
        <details className="note-options"><summary>Edit note</summary><div className="controls">
          <button onClick={() => setEditing(true)}>Edit</button>
          {item.category === 'action' && (item.assignee === 'unassigned'
            ? <button onClick={() => onUpdate(item.id, { assignee: 'you' })}>Assign to me</button>
            : <button onClick={() => onUpdate(item.id, { assignee: 'unassigned' })}>Unassign</button>)}
          {item.category === 'decision' && (
            <select aria-label="Decision state" value={item.state} onChange={(e) => onUpdate(item.id, { state: e.target.value as Item['state'] })}>
              <option value="discussed">Discussed</option><option value="proposed">Proposed</option><option value="decided">Decided</option>
            </select>
          )}
          {(item.category === 'action' || item.category === 'deadline') && (
            <label className="due-edit">Due <input aria-label="Due date" type="date" value={item.due ?? ''} onChange={(e) => onUpdate(item.id, { due: e.target.value || undefined })} /></label>
          )}
          <select aria-label="Note category" value={item.category} onChange={(e) => {
            const category = e.target.value as Category;
            onUpdate(item.id, {
              category,
              assignee: category === 'action' ? item.assignee : 'unassigned',
              state: category === 'decision' ? item.state : 'discussed',
              due: category === 'action' || category === 'deadline' ? item.due : undefined,
            });
          }}>
            {ORDER.map((c) => <option key={c} value={c}>{HEADING[c]}</option>)}
          </select>
          <button onClick={() => onUpdate(item.id, { dismissed: true })}>Dismiss</button>
        </div></details>
      </article>
    </Frame>
  );
}

function transcriptContext(meeting: Meeting, item: Item): Meeting['events'] {
  const eventId = item.evidence[0]?.eventIds[0];
  const index = meeting.events.findIndex((event) => event.id === eventId);
  if (index < 0) return [];
  return meeting.events.slice(Math.max(0, index - 1), index + 2);
}
