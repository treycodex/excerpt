import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { NotesWorkspace, OPEN_AT_KEY } from './NotesWorkspace';
import { NotesDocument } from './NotesDocument';
import { readMeetingImage } from '../meetingImages';
import { acceptsAcknowledgment, applyPreferences, bridge, relateItems, compareNotesDocuments, meetingMutation, mutateMeeting, notesMetadataDifference, matchedBoosts, mergeGeneratedNotes, notesCapability, orderCategories, preserveGeneratedConflict, reconcileMeetingUpdate, toMarkdown, toTurns, refreshMeetingNotes, preserveNoteEdits, noteTitle, editableDocument, insertMeetingImage, meetingImagePassage, previewTranscriptCorrection, safeImageUrl, toHTML, transcriptEventTime } from '@excerpt/core';
import { Frame, Strip } from '@excerpt/ui';
import type { StripMark } from '@excerpt/ui';
import type { ItemRelation } from '@excerpt/core';
import type { Category, Evidence, Item, Meeting, MeetingImage, NoteBlock, NotesDocument as Document, NotesGenerationRequest, NotesProviderStatus, Preferences as Prefs } from '@excerpt/types';

type Style = NotesGenerationRequest['style'];

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

/** A finished request waiting for consent, and what it would actually change. */
interface Candidate {
  /** The wording as produced, re-merged at accept time so later edits survive. */
  produced: Document;
  /** The merged result, which is what the preview shows. */
  preview: Document;
  change: 'metadata' | 'wording';
  /** For a metadata change, which half of it moved. */
  difference: 'sources' | 'provenance' | 'both';
  /** The transcript revision it was produced from. */
  revision: number;
}

/** What a metadata-only change is, in a sentence that is true of that change. */
const METADATA_COPY: Record<Candidate['difference'], string> = {
  sources: 'The wording is unchanged. The linked transcript sources or review flags differ, so this still needs your approval.',
  provenance: 'The wording is unchanged, and so are its sources. What changes is how these notes are described: who produced this wording, and how.',
  both: 'The wording is unchanged. Its linked sources and how these notes were produced both differ, so this still needs your approval.',
};

const STALE = 'The transcript changed while that was running, so nothing was applied. Run it again to use the new wording.';

/**
 * Whether to offer the one-line pointer at personalization.
 *
 * Setting a subtitle style and a review order used to stand between finishing a
 * meeting and reading it. It does not any more, so the page mentions them once,
 * below the notes, and never again after a dismissal or for anyone who already
 * walked the old wizard. Storage refusing the write is not worth an error: the
 * hint simply stays gone for this session.
 */

const HEADING: Record<Category, string> = {
  decision: 'Decisions',
  action: 'Action items',
  deadline: 'Deadlines',
  question: 'Open questions',
};
const ORDER: Category[] = ['decision', 'action', 'deadline', 'question'];
type ItemPatch = Omit<Partial<Item>, 'due'> & { due?: string | undefined };

export function Notes({ meeting: initial, prefs, initialSaveFailed = false }:
  { meeting: Meeting; prefs?: Prefs | null; initialSaveFailed?: boolean }) {
  const [meeting, setMeeting] = useState(initial);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [focusedEvent, setFocusedEvent] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<{ text: string; evidence: Evidence[] } | null>(null);
  const [selectedMoment, setSelectedMoment] = useState<string | null>(null);
  const [expandedMoment, setExpandedMoment] = useState(false);
  const [position, setPosition] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [tab, setTab] = useState<'notes' | 'transcript' | 'review'>('notes');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>(initialSaveFailed ? 'failed' : 'saved');
  const [running, setRunning] = useState<'' | 'refresh' | Style>('');
  const [generationMessage, setGenerationMessage] = useState('');
  const [generationError, setGenerationError] = useState<{ message: string; style?: Style } | null>(null);
  const [providerStatus, setProviderStatus] = useState<NotesProviderStatus | undefined>(undefined);
  const [statusRead, setStatusRead] = useState(!bridge()?.getNotesProviderStatus);
  const requestToken = useRef(0);
  const generating = running !== '';
  const saveVersion = useRef(0);
  const latestMeeting = useRef(meeting);
  const durableMeeting = useRef(initial);
  const pendingSaves = useRef(new Set<number>());
  const [correction, setCorrection] = useState<{ eventId: string; text: string } | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pendingImageOrigin, setPendingImageOrigin] = useState<MeetingImage['origin']>('import');
  const [imageTime, setImageTime] = useState('0:00');
  const [imageError, setImageError] = useState('');
  const [importing, setImporting] = useState(false);
  // What the reader would actually end up with, kept beside the wording it came from
  // so it can be re-merged against whatever the document says at the moment they
  // accept it rather than against whatever it said when the request was made.
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});
  const cards = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    setMeeting((current) => {
      if (initial.id !== current.id) { latestMeeting.current = initial; return initial; }
      const durable = durableMeeting.current;
      const next = reconcileMeetingUpdate(initial, durable, current, pendingSaves.current.size > 0);
      if ((initial.revision ?? initial.draftRevision ?? 0) >= (durable.revision ?? durable.draftRevision ?? 0)) {
        durableMeeting.current = initial;
      }
      latestMeeting.current = next;
      return next;
    });
    if (initial.suggestedNotes) {
      offer(editableDocument({ ...initial, notes: initial.suggestedNotes, images: [] }), initial,
        'The enhanced wording matches what is already here, so nothing was replaced.');
    }
  }, [initial]);

  // Read once, without making a request of the provider. A bridge that cannot answer
  // leaves the status undefined, which is read as "not proven ready", not as ready.
  useEffect(() => {
    const host = bridge();
    if (!host?.getNotesProviderStatus) return;
    let live = true;
    void host.getNotesProviderStatus()
      .then((status) => { if (live) setProviderStatus(status); })
      .catch(() => {})
      .finally(() => { if (live) setStatusRead(true); });
    return () => { live = false; };
  }, []);

  const persist = (next: Meeting) => {
    const version = ++saveVersion.current;
    latestMeeting.current = next;
    setMeeting(next);
    setSaveState('saving');
    pendingSaves.current.add(version);

    const send = async (desired: Meeting, base: Meeting, attempts = 0): Promise<Meeting> => {
      const mutation = meetingMutation(base, desired);
      if (!mutation) return base;
      const acknowledgment = await mutateMeeting(mutation);
      if (acknowledgment.status === 'conflict') {
        if (attempts >= 2) throw new Error(acknowledgment.message ?? 'The meeting changed while saving.');
        if (version !== saveVersion.current) return acknowledgment.meeting;
        // Document generation may win a race with local typing. Keep its result as a
        // suggestion, then retry the local document against the acknowledged base.
        const rebased = preserveGeneratedConflict(acknowledgment.meeting, desired);
        return send(rebased, acknowledgment.meeting, attempts + 1);
      }
      return acknowledgment.meeting;
    };

    // Send immediately. A later edit is never trapped behind a JavaScript-only queue
    // that disappears when the window closes; native revisions serialize the calls.
    void send(next, durableMeeting.current).then((authoritative) => {
      const accepted = acceptsAcknowledgment({
        operationId: '', meetingId: authoritative.id, status: 'applied',
        revision: authoritative.revision ?? authoritative.draftRevision ?? 0,
        documentRevision: authoritative.documentRevision ?? authoritative.draftRevision ?? 0,
        sourceRevision: authoritative.sourceRevision ?? 0, meeting: authoritative,
      }, durableMeeting.current);
      if (accepted) durableMeeting.current = authoritative;
      if (version !== saveVersion.current) return;
      if (accepted) {
        latestMeeting.current = authoritative;
        setMeeting(authoritative);
      }
      setSaveState('saved');
    }).catch(() => {
      if (version === saveVersion.current) setSaveState('failed');
    }).finally(() => {
      pendingSaves.current.delete(version);
    });
  };

  const noteDocument = useMemo(() => editableDocument(meeting), [meeting]);
  const editDocument = (notes: Document) => {
    const next = { ...latestMeeting.current, notes };
    delete next.suggestedNotes;
    persist(next);
  };
  const queueImages = (files: File[], origin: MeetingImage['origin'] = 'import') => {
    setPendingImages(files); setImageError('');
    setPendingImageOrigin(origin);
    const start = new Date(meeting.startedAt).getTime();
    const end = meeting.endedAt ? new Date(meeting.endedAt).getTime() : start + duration;
    const fileTime = files[0]?.lastModified ?? 0;
    setImageTime(clock(fileTime >= start && fileTime <= end ? fileTime - start : position ?? 0));
  };
  const importImages = async () => {
    const match = /^(\d+):([0-5]\d)$/.exec(imageTime);
    if (!match) { setImageError('Enter a meeting time as minutes:seconds, for example 12:34.'); return; }
    const at = (Number(match[1]) * 60 + Number(match[2])) * 1000;
    if (at > duration) { setImageError('Choose a time within this meeting.'); return; }
    setImporting(true);
    const targetId = meeting.id;
    try {
      const capturedAt = new Date(new Date(meeting.startedAt).getTime() + at).toISOString();
      const images = await Promise.all(pendingImages.map((file) => readMeetingImage(file, at, capturedAt, pendingImageOrigin)));
      if (latestMeeting.current.id !== targetId) return;
      let next = latestMeeting.current;
      for (const image of images) next = insertMeetingImage(next, image);
      persist(next); setPendingImages([]);
    } catch (error) { setImageError(error instanceof Error ? error.message : 'Could not import that image.'); }
    finally { setImporting(false); }
  };
  /**
   * Offer a finished result — but only if it would change something.
   *
   * The comparison is made against the document the reader would actually end up
   * with, after the rules that keep their own writing and their images in place. A
   * rebuild that reproduces the same thirteen excerpts is a status line, not a
   * replacement to approve; a change confined to sources and review flags is real,
   * still needs consent, and is not described as new wording.
   */
  const offer = (produced: Document, against: Meeting, unchanged: string) => {
    const current = editableDocument(against);
    const preview = mergeGeneratedNotes(current, produced);
    const change = compareNotesDocuments(current, preview);
    if (change === 'same') { setCandidate(null); setGenerationMessage(unchanged); return; }
    setGenerationMessage('');
    setCandidate({ produced, preview, change,
      difference: notesMetadataDifference(current, preview),
      revision: against.sourceRevision ?? 0 });
  };

  /** A request is stale if the meeting or its transcript moved underneath it. */
  const begin = () => ({ token: ++requestToken.current, id: latestMeeting.current.id, revision: latestMeeting.current.sourceRevision ?? 0 });
  const stale = (request: { token: number; id: string; revision: number }) =>
    request.token !== requestToken.current
    || latestMeeting.current.id !== request.id
    || (latestMeeting.current.sourceRevision ?? 0) !== request.revision;

  /** Ours, deterministic, always available where there is a transcript. */
  const refreshExcerpts = () => {
    if (generating) return;
    const request = begin();
    setRunning('refresh'); setGenerationMessage(''); setGenerationError(null); setCandidate(null);
    try {
      const source = latestMeeting.current;
      const rebuilt = refreshMeetingNotes(source);
      if (stale(request)) { setGenerationMessage(STALE); return; }
      offer(editableDocument({ ...rebuilt, images: [] }), source, 'Your excerpts are already up to date.');
    } finally { setRunning(''); }
  };

  /**
   * A provider's rewrite. A failure keeps the current notes and says what failed; it
   * never quietly hands back the extractive rebuild dressed as the rewrite that was
   * asked for. Running that rebuild instead is offered, and stays the reader's choice.
   */
  const enhance = async (style: Style) => {
    const host = bridge();
    if (!host?.summarizeNotes || generating) return;
    const request = begin();
    setRunning(style); setGenerationMessage(''); setGenerationError(null); setCandidate(null);
    try {
      const source = latestMeeting.current;
      const generated = await host.summarizeNotes(refreshMeetingNotes(source), { style });
      if (stale(request)) { setGenerationMessage(STALE); return; }
      const produced = editableDocument({ ...source, notes: preserveNoteEdits(generated, source.notes), images: [] });
      offer(produced, source, 'No wording changes were produced. Your current notes were kept.');
    } catch (error) {
      if (stale(request)) return;
      setGenerationError({ message: error instanceof Error ? error.message : 'Note enhancement is unavailable. Your current notes were kept.', style });
    } finally { setRunning(''); }
  };

  // So Preferences can offer the way back to the notes this was opened from.
  const rememberReturn = () => {
    try { sessionStorage.setItem('excerpt:return-to', meeting.id); } catch { /* the back button still works */ }
  };

  const update = (id: string, patch: ItemPatch) => {
    const next = {
      ...meeting,
      items: meeting.items.map((i): Item => {
        if (i.id !== id) return i;
        const updated = { ...i, title: noteTitle(i), ...patch, userEdited: true } as Item & { due?: string | undefined };
        if ('due' in patch && !patch.due) delete updated.due;
        return updated;
      }),
    };
    persist(next);
  };

  const visible = meeting.items.filter((i) => !i.dismissed);
  const isLiveDraft = !meeting.endedAt && meeting.draftRevision !== undefined;
  // A bridge is not itself a provider. Until the host has answered, nothing that
  // needs a provider is offered.
  const capability = notesCapability({
    isLiveDraft, hasTranscript: meeting.events.length > 0, native: true,
    hasProviderCall: !!bridge()?.summarizeNotes && statusRead,
    status: providerStatus,
  });
  const live = prefs ? applyPreferences(visible, prefs) : visible;
  const duration = Math.max(1, ...meeting.events.map(transcriptEventTime), ...(meeting.images ?? []).map((i) => i.at), meeting.endedAt ? new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime() : 0);
  const decided = live.filter((i) => i.state === 'decided' && i.category === 'decision');
  const mine = live.filter((i) => i.assignee === 'you');
  const review = live.filter((i) => i.category === 'action' && i.assignee === 'unassigned');
  // Suggestions, derived rather than stored: nothing is written until the reader
  // answers, so a rejected link cannot come back as stale data.
  const relations = useMemo(() => relateItems(live), [live]);
  const relationOf = useMemo(() => new Map(relations.map((r) => [r.itemId, r])), [relations]);
  const dismissed = meeting.items.filter((i) => i.dismissed);

  // Sections follow the user's stated order; ordering never hides anything.
  const sectionOrder = prefs ? orderCategories(prefs) : ORDER;


  const grouped = useMemo(
    () => [...sectionOrder.filter((c) => c !== 'action'), 'action' as const].map((c) => [c, live.filter((i) => i.category === c)] as const)
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

  const marks: StripMark[] = [...live.map((i) => ({
    id: `item:${i.id}`,
    at: i.evidence[0] ? (i.evidence[0].tStart !== undefined ? i.evidence[0].tStart * 1000 : i.evidence[0].tArrived) : 0,
    settled: i.state === 'decided',
    label: i.title,
    kind: 'item' as const,
  })), ...(meeting.images ?? []).map((image) => ({
    id: `image:${image.id}`, at: image.at, label: image.caption || 'Captured moment', kind: 'image' as const,
  }))];

  const scrollBehavior = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const;

  /** One gesture: select an item, move the playhead, frame its passage. */
  const selectItem = (id: string) => {
    const item = meeting.items.find((i) => i.id === id);
    const ev = item?.evidence[0];
    if (!ev) return;
    setTab('review');
    setSelectedMoment(null);
    setActiveItem(id);
    setPosition(ev.tArrived);
    setFocusedEvent(ev.eventIds[0] ?? null);
    cards.current[id]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  const openMoment = (id: string) => {
    const image = meeting.images?.find((candidate) => candidate.id === id);
    if (!image) return;
    setTab('notes');
    setActiveItem(null);
    setSelectedMoment(id);
    setExpandedMoment(false);
    setPosition(image.at);
  };

  const selectMark = (id: string) => {
    if (id.startsWith('image:')) openMoment(id.slice(6));
    else if (id.startsWith('item:')) selectItem(id.slice(5));
  };

  const revealEvidence = (itemId: string, eventId: string, at: number) => {
    setActiveItem(itemId);
    setPosition(at);
    setFocusedEvent(eventId);
    cards.current[itemId]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  /**
   * The reader says these two were one commitment.
   *
   * The later item keeps the work and absorbs the earlier one's passages; the
   * earlier is dismissed rather than deleted, so it is still in the Dismissed
   * list and still restorable. `related` records what was joined — shown as a
   * related moment, never asserted as a cause.
   */
  const joinRelated = (relation: ItemRelation) => {
    const earlier = meeting.items.find((i) => i.id === relation.relatedId);
    const later = meeting.items.find((i) => i.id === relation.itemId);
    if (!earlier || !later) return;
    persist({
      ...meeting,
      items: meeting.items.map((item) => {
        if (item.id === later.id) {
          return { ...item,
            related: [...(item.related ?? []), earlier.id],
            evidence: [...item.evidence, ...earlier.evidence] };
        }
        if (item.id === earlier.id) return { ...item, dismissed: true };
        return item;
      }),
    });
  };

  /**
   * Not the same thing.
   *
   * Recorded as a rejection rather than as an edit. Setting `userEdited` also
   * stopped the question, but it told the rest of the app the reader had
   * hand-corrected this item, which `refreshMeetingNotes` then protects from
   * being replaced by a fresh extraction. Declining a suggestion is not an edit.
   */
  const rejectRelated = (relation: ItemRelation) => {
    persist({
      ...meeting,
      items: meeting.items.map((item) => (item.id === relation.itemId
        ? { ...item, unrelated: [...(item.unrelated ?? []), relation.relatedId] }
        : item)),
    });
  };

  /**
   * Undo a join: give the absorbed item back its own row.
   *
   * The passages that came from it are matched by source and removed from the
   * survivor, so nothing is duplicated and nothing is lost. Without this a join
   * was the one irreversible action in a product whose whole claim is that every
   * item can be corrected.
   */
  const separateRelated = (item: Item, otherId: string) => {
    const other = meeting.items.find((i) => i.id === otherId);
    if (!other) return;
    const fromOther = new Set(other.evidence.map((e) => `${e.eventIds.join('|')}:${e.quote}`));
    const remaining = item.evidence.filter((e) => !fromOther.has(`${e.eventIds.join('|')}:${e.quote}`));
    persist({
      ...meeting,
      items: meeting.items.map((candidate) => {
        if (candidate.id === item.id) {
          const related = (candidate.related ?? []).filter((id) => id !== otherId);
          // `related` is dropped rather than set to undefined: the last join
          // undone should leave no trace of the field at all.
          const { related: _joined, ...rest } = candidate;
          return {
            ...rest,
            // Keep at least the passage this item was extracted from.
            evidence: remaining.length ? remaining : candidate.evidence.slice(0, 1),
            ...(related.length ? { related } : {}),
            unrelated: [...(candidate.unrelated ?? []), otherId],
          };
        }
        if (candidate.id === otherId) return { ...candidate, dismissed: false };
        return candidate;
      }),
    });
  };

  const openTranscript = (eventId: string) => {
    setFocusedEvent(eventId);
    setTab('transcript');
  };

  /** Show every passage a note cites, without leaving the document to do it. */
  const openSource = (note: { text: string; evidence: Evidence[] }) => {
    setSourceNote(note);
    setSelectedMoment(null);
    setTab('notes');
  };
  const openBlockSource = (block: NoteBlock) => openSource(block);
  const openItemSource = (item: Item) => openSource({ text: noteTitle(item), evidence: item.evidence });

  const sourcePassages = useMemo(() => (sourceNote?.evidence ?? [])
    .map((evidence) => ({ evidence, around: evidenceContext(meeting, evidence) })), [sourceNote, meeting]);

  useEffect(() => {
    if (tab === 'transcript' && focusedEvent) rows.current[focusedEvent]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  }, [tab, focusedEvent]);

  // Arrived from a library search that matched something said in this meeting:
  // open at the passage rather than at the top, which is the whole point of
  // searching the transcript.
  useEffect(() => {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem(OPEN_AT_KEY);
      if (target) sessionStorage.removeItem(OPEN_AT_KEY);
    } catch { /* nothing to restore */ }
    if (target && meeting.events.some((e) => e.id === target)) openTranscript(target);
    // Only on arrival at a meeting, never on a later re-render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  useEffect(() => {
    if (tab === 'review' && activeItem) cards.current[activeItem]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  }, [tab, activeItem]);

  useEffect(() => {
    if (tab === 'notes' && selectedMoment) document.getElementById('selected-moment')?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  }, [tab, selectedMoment]);

  /** Scrubbing the rail lands on the nearest thing actually said. */
  const scrub = (ms: number) => {
    if (!meeting.events.length) return;
    setTab('transcript');
    setSelectedMoment(null);
    setPosition(ms);
    const nearest = meeting.events.reduce((best, e) =>
      Math.abs(transcriptEventTime(e) - ms) < Math.abs(transcriptEventTime(best) - ms) ? e : best, meeting.events[0]!);
    setFocusedEvent(nearest.id);
    rows.current[nearest.id]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  const copy = async () => {
    try {
      const snapshot = { ...meeting, notes: noteDocument, items: [...live, ...dismissed] };
      const markdown = toMarkdown(snapshot);
      const html = toHTML(snapshot);
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        })]);
      } else await navigator.clipboard.writeText(markdown);
      setCopyFailed(false); setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { setCopyFailed(true); }
  };

  const download = async () => {
    const markdown = toMarkdown({ ...meeting, notes: noteDocument, items: [...live, ...dismissed] });
    const filename = `${meeting.title.replace(/\W+/g, '-').toLowerCase()}.md`;

    // Inside Excerpt's own window a browser download goes somewhere the user cannot
    // find, which reads as the export having failed. The host opens a real save panel.
    const host = bridge();
    if (host) {
      try {
        const outcome = await host.exportMarkdown(filename, markdown);
        if (outcome === 'saved') setGenerationMessage('Markdown exported.');
      } catch (error) {
        setGenerationMessage(error instanceof Error ? error.message : 'Could not export Markdown.');
      }
      return;
    }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportHTML = async () => {
    const html = toHTML({ ...meeting, notes: noteDocument });
    const filename = `${meeting.title.replace(/\W+/g, '-').toLowerCase()}.html`;
    const host = bridge();
    if (host?.exportHTML) {
      try {
        const outcome = await host.exportHTML(filename, html);
        if (outcome === 'saved') setGenerationMessage('HTML exported.');
      } catch (error) {
        setGenerationMessage(error instanceof Error ? error.message : 'Could not export HTML.');
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const correctionPreview = correction ? previewTranscriptCorrection(meeting, correction.eventId, correction.text) : null;
  const moment = selectedMoment ? meeting.images?.find((image) => image.id === selectedMoment) : undefined;
  const momentBlock = moment ? noteDocument.blocks?.find((block) => block.imageId === moment.id) : undefined;
  const momentPassage = moment ? meetingImagePassage(meeting, moment, expandedMoment) : [];
  const captionMoment = (text: string) => {
    if (!moment || !momentBlock) return;
    const notes = { ...noteDocument, blocks: noteDocument.blocks!.map((block) => block.id === momentBlock.id ? { ...block, text, userEdited: true } : block) };
    const next = { ...latestMeeting.current, notes, images: (latestMeeting.current.images ?? []).map((image) => image.id === moment.id ? { ...image, caption: text, needsReview: false } : image) };
    delete next.suggestedNotes;
    persist(next);
  };
  /**
   * Apply, merging again against the document as it stands now.
   *
   * The reader can keep writing while a preview is on screen, and a correction can
   * advance the transcript underneath it. Re-merging keeps those edits; the revision
   * check refuses a result produced from wording that no longer exists.
   */
  const acceptCandidate = () => {
    if (!candidate) return;
    if ((latestMeeting.current.sourceRevision ?? 0) !== candidate.revision) {
      setCandidate(null); setGenerationMessage(STALE); return;
    }
    editDocument(mergeGeneratedNotes(editableDocument(latestMeeting.current), candidate.produced));
    setCandidate(null);
    setGenerationMessage('Applied. Your writing, images and image positions were kept.');
  };

  return (
    <NotesWorkspace currentId={meeting.id}>
    <div className="notebook-toolbar"><a href="#/meetings">All meetings <span>/</span> Meeting notes</a><div><span className={`save-state ${saveState}`} role="status">{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved — export a copy' : 'Saved on this device'}</span><button onClick={copy}>{copied ? 'Copied ✓' : 'Copy notes'}</button><button onClick={() => { void download(); }}>Markdown ↗</button><button onClick={() => { void exportHTML(); }}>Export with images ↗</button></div></div>
    <div className="notes notes-reading">
      <header className="masthead">
        <div className="notebook-date">{new Date(meeting.startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} <span>·</span> {clock(duration)} <span>·</span> {isLiveDraft ? 'Live meeting' : meeting.processing === 'demo' ? 'Legacy meeting' : meeting.processing === 'cloud' ? 'Cloud transcription' : 'On-device transcription'}</div>
        <input className="document-title" aria-label="Meeting title" value={meeting.title} onChange={(e) => persist({ ...meeting, title: e.target.value })} />
        {/* "Your conversation" is a claim about the recording, and it is wrong on one
            that had a single voice in it — the page says so two lines below. */}
        <p className="notebook-description">{noteDocument.notice
          ? 'What was recorded, with the important parts ready to revisit.'
          : 'Your conversation, with the important parts ready to revisit.'}</p>
        <div className="note-counts" aria-label="Meeting note counts"><span><b>{decided.length}</b> decisions</span><span><b>{mine.length}</b> assigned to you</span><span><b>{review.length}</b> to assign</span></div>
        {copyFailed && <p role="status" className="rubric">Could not copy to the clipboard. Use Export to save your notes.</p>}
        <div className="notebook-tabs" role="group" aria-label="Meeting view"><button aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>Notes</button><button aria-pressed={tab === 'review'} onClick={() => setTab('review')}>Review <span>{live.filter((i) => !i.confirmed || i.needsReview).length}</span></button><button aria-pressed={tab === 'transcript'} onClick={() => setTab('transcript')}>Transcript <span>{meeting.events.length}</span></button></div>
        <details className="notebook-timeline"><summary>Explore meeting timeline</summary><Strip duration={duration} position={position} marks={marks} onScrub={scrub} onSelect={selectMark} {...(selectedMoment ? { selectedId: `image:${selectedMoment}` } : activeItem ? { selectedId: `item:${activeItem}` } : {})} /><p className="rubric">{meeting.events.some((e) => e.tStart !== undefined) ? 'Lines are notes; diamonds are captured moments. Select either to revisit its source.' : 'Lines are notes; diamonds are captured moments. Transcript timings are approximate.'}</p></details>
      </header>
      <div hidden={tab !== 'notes'}>
      <Recap items={live} images={meeting.images ?? []} onItem={openItemSource} onMoment={openMoment} />
      {sourceNote && <SourcePanel note={sourceNote} passages={sourcePassages}
        onOpen={openTranscript} onClose={() => setSourceNote(null)} />}
      {moment && <MomentViewer image={moment} caption={momentBlock?.text ?? moment.caption} passage={momentPassage} expanded={expandedMoment} onCaption={captionMoment} onExpand={() => setExpandedMoment((value) => !value)} onClose={() => setSelectedMoment(null)} onSource={openTranscript} />}
      <div className="document-toolbar">
        {/* What produced this wording, then what the buttons beside it can actually
            do here — before they are pressed, not in the message afterwards. */}
        <div className="document-provenance">
          <span>{isLiveDraft ? 'Live draft · saved as you write' : noteDocument.method === 'cloud' ? `Enhanced with OpenAI · ${noteDocument.generation?.model ?? 'BYOK'}` : noteDocument.method === 'on-device' ? 'Enhanced on this Mac' : 'From your transcript'}</span>
          {capability.explanation && <small>{capability.explanation}{capability.settings && capability.enhancements.length === 0
            && <> <a href="#/preferences" onClick={rememberReturn}>Note enhancement settings</a></>}</small>}
        </div>
        {(capability.refresh || capability.enhancements.length > 0) && <div className="generation-actions">
          {capability.enhancements.map((enhancement) => <button key={enhancement.style} disabled={generating} onClick={() => { void enhance(enhancement.style); }}>
            {running === enhancement.style ? 'Improving notes…' : enhancement.label}
          </button>)}
          {capability.refresh && <button disabled={generating} onClick={refreshExcerpts}>{running === 'refresh' ? 'Refreshing excerpts…' : 'Refresh excerpts'}</button>}
        </div>}
      </div>
      {/* Why these are the transcript-based notes, where they are read rather than
          only in the menu bar the moment the meeting ended. Suppressed once the user
          has asked for a regeneration, whose own message is the current answer. */}
      {(meeting.generationStatus?.state === 'queued' || meeting.generationStatus?.state === 'running')
        && <p className="rubric" role="status">Organizing notes… You can keep writing while this finishes.</p>}
      {meeting.generationStatus?.state === 'failed'
        && <p className="rubric" role="alert">{meeting.generationStatus.message ?? 'Automatic note enhancement could not be saved. Your transcript and current notes are intact.'}</p>}
      {noteDocument.notice && !generationMessage && <p className="rubric" role="status">{noteDocument.notice}</p>}
      {generationMessage && <p className="rubric" role="status">{generationMessage}</p>}
      {/* A failed rewrite is not a successful rebuild. The notes on screen are the
          ones that were there; running ours instead stays an explicit choice. */}
      {generationError && <section className="generation-error" role="alert">
        <p>{generationError.message}</p>
        <div>
          {generationError.style && <button disabled={generating} onClick={() => { void enhance(generationError.style!); }}>Try again</button>}
          <button disabled={generating} onClick={refreshExcerpts}>Refresh excerpts instead</button>
          {capability.settings && <a href="#/preferences" onClick={rememberReturn}>Note enhancement settings</a>}
        </div>
      </section>}
      {candidate && <section className="document-preview" aria-label="Regenerated notes preview">
        <h2>{candidate.change === 'wording' ? 'Review the new wording'
          : candidate.difference === 'provenance' ? 'Review how these notes are described' : 'Review the updated sources'}</h2>
        <p>{candidate.change === 'wording'
          ? 'Your writing, images and image positions will be kept. Generated text will be replaced.'
          : METADATA_COPY[candidate.difference]}</p>
        {candidate.preview.blocks?.filter((b) => b.kind !== 'image').map((b) => <p key={b.id}>{b.text}</p>)}
        <button onClick={acceptCandidate}>{candidate.change === 'wording' ? 'Use this wording'
          : candidate.difference === 'provenance' ? 'Update the description' : 'Update the sources'}</button>
        <button onClick={() => setCandidate(null)}>Keep current notes</button>
      </section>}
      {pendingImages.length > 0 && <section className="image-placement" aria-label="Place screenshot"><h2>Place {pendingImages.length === 1 ? 'image' : 'images'} in the conversation</h2><p>Choose when this was shown. The image will sit beside the notes from that moment.</p><label>Meeting time <input aria-label="Image meeting time" value={imageTime} onChange={(e) => setImageTime(e.target.value)} placeholder="12:34" /></label><button disabled={importing} onClick={() => { void importImages(); }}>{importing ? 'Adding…' : 'Add to notes'}</button><button disabled={importing} onClick={() => setPendingImages([])}>Cancel</button>{imageError && <p role="alert">{imageError}</p>}</section>}
      <fieldset className="notes-editor" disabled={generating || importing}>
      <NotesDocument document={noteDocument} images={meeting.images ?? []} onChange={editDocument} onSource={openBlockSource} onImages={queueImages} onMoment={openMoment} selectedImageId={selectedMoment} />
      </fieldset>
      </div>
      <div hidden={tab !== 'review'}>
      <div className="review-intro"><h2>Before you move on</h2><p>Check what was agreed, what you own, and what still needs an owner. Confirming an item does not mark the work complete.</p><span>{live.filter((i) => i.confirmed && !i.needsReview).length} of {live.length} reviewed</span></div>
      <fieldset className="notes-editor" disabled={generating}>
      {live.length === 0 && <p>No decisions or commitments were extracted. You can still write freely in Notes.</p>}
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
                relation={relationOf.get(item.id)}
                relatedTitle={relationOf.has(item.id)
                  ? noteTitle(live.find((i) => i.id === relationOf.get(item.id)!.relatedId)!)
                  : undefined}
                onJoin={joinRelated}
                onReject={rejectRelated}
                joined={(item.related ?? [])
                  .map((id) => meeting.items.find((other) => other.id === id))
                  .filter((other): other is Item => !!other)
                  .map((other) => ({ id: other.id, title: noteTitle(other) }))}
                onSeparate={separateRelated}
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
      </fieldset>
      </div>
      {/* No heading: the segmented control directly above already says Transcript.
          Turns rather than lines — one speaker label per stretch of speech, because a
          settled result is not a unit anybody reads in. */}
      <section className="transcript" hidden={tab !== 'transcript'}>
        {/* The way back. Opening a passage from the source panel switched tabs and
            left nothing saying where the reader had come from, so checking a note
            cost them their place. The panel itself is still open behind this. */}
        {sourceNote && (
          <button className="return-to-note" onClick={() => setTab('notes')}>
            ← Back to the note you were checking
            <span>“{sourceNote.text.length > 60 ? `${sourceNote.text.slice(0, 60)}…` : sourceNote.text}”</span>
          </button>
        )}
        {correction && correctionPreview && <div className="correction-preview" role="region" aria-label="Review transcript correction"><h2>Correct this passage</h2><textarea aria-label="Corrected transcript" value={correction.text} onChange={(e) => setCorrection({ ...correction, text: e.target.value })} /><p>The original transcript is preserved. Review the affected notes below before applying.</p>{correctionPreview.changes.map((change, index) => <div className="correction-change" key={index}><del>{change.before}</del><p>{change.after}</p></div>)}{!correctionPreview.changes.length && <p>No generated notes are affected.</p>}<button disabled={!correction.text.trim() || correctionPreview.meeting === meeting} onClick={() => { persist(correctionPreview.meeting); setCandidate(null); setGenerationError(null); setGenerationMessage('Correction saved. Any generated wording that used it is marked for review; regenerating refreshes it.'); setCorrection(null); }}>Apply correction and update notes</button><button onClick={() => setCorrection(null)}>Cancel</button></div>}
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
                  <button className="correct-transcript" onClick={() => setCorrection({ eventId: e.id, text: e.text })}>Correct</button>
                  {e.originalText !== undefined && <span className="correction-original">Original: {e.originalText} · {e.corrections?.length ?? 1} correction(s)</span>}
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

function MomentViewer({ image, caption, passage, expanded, onCaption, onExpand, onClose, onSource }: {
  image: MeetingImage; caption: string; passage: Meeting['events']; expanded: boolean;
  onCaption: (text: string) => void; onExpand: () => void; onClose: () => void; onSource: (id: string) => void;
}) {
  const origin = image.origin === 'excerpt' ? 'Excerpt capture' : image.origin === 'drop' ? 'Dropped image' : image.origin === 'paste' ? 'Pasted image' : image.origin === 'import' ? 'Imported image' : 'Captured image';
  return <aside id="selected-moment" className="moment-viewer" aria-label={`Captured moment at ${clock(image.at)}`}>
    <header><div><span>Captured moment</span><strong>{clock(image.at)}</strong></div><button aria-label="Close captured moment" onClick={onClose}>×</button></header>
    <div className="moment-layout">
      <div>{safeImageUrl(image.dataUrl) ? <img src={image.dataUrl} alt={caption || `Captured moment at ${clock(image.at)}`} /> : <p>Image unavailable.</p>}<label>Caption<input value={caption} onChange={(event) => onCaption(event.target.value)} placeholder="What should you remember about this?" /></label><small>{origin} · {new Date(image.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>{image.needsReview && <p className="source-review-notice">Nearby transcript wording changed. Recheck this moment’s context.</p>}</div>
      <section><h3>Conversation around this moment</h3>{passage.length ? passage.map((event) => <button className="moment-passage" key={event.id} onClick={() => onSource(event.id)}><span>{event.role === 'you' ? 'You' : event.speakerLabel === 'SPEAKER' ? 'Others' : event.speakerLabel} · {stamp(event)}</span>{event.text}</button>) : <p className="moment-empty">No speech settled around this capture. The image is still saved at its original time.</p>}<button className="moment-expand" onClick={onExpand}>{expanded ? 'Show nearby passage' : 'Expand passage'}</button><p>Nearby speech gives context. It does not claim the words describe the image.</p></section>
    </div>
  </aside>;
}

/**
 * What the meeting settled, before the meeting itself.
 *
 * The document is chronological, so the outcome had to be reassembled by reading
 * the whole conversation back — and the structured version of it lived in a
 * different tab, which is not where somebody opening their notes is looking.
 *
 * Deliberately read-only, and deliberately not part of the document. A block kind
 * would need an arm in every exporter, would be editable prose the regeneration
 * merge has to protect, and would put a generated summary inside a document its
 * reader owns. This reflects the items; it never becomes them.
 */
function Recap({ items, images, onItem, onMoment }: {
  items: Item[];
  images: MeetingImage[];
  onItem: (item: Item) => void;
  onMoment: (id: string) => void;
}) {
  const live = items.filter((i) => !i.dismissed);
  const decisions = live.filter((i) => i.category === 'decision' && i.state === 'decided');
  // Shown, and shown as unsettled. Styling a proposal like a decision is the one
  // mistake this whole extractor is built to avoid, and a recap is the likeliest
  // place to make it.
  const proposals = live.filter((i) => i.category === 'decision' && i.state === 'proposed');
  const commitments = live.filter((i) => i.category === 'action' && i.assignee === 'you');
  const unassigned = live.filter((i) => i.category === 'action' && i.assignee !== 'you');
  const questions = live.filter((i) => i.category === 'question');
  const dates = live.filter((i) => i.category === 'deadline');

  const sections: { title: string; note?: string; items: Item[] }[] = [
    { title: 'Decided', items: decisions },
    { title: 'Yours to do', items: commitments },
    { title: 'Not assigned', note: 'Said to somebody. Two streams cannot tell whom.', items: unassigned },
    { title: 'Left open', items: questions },
    { title: 'Dates', items: dates },
    { title: 'Raised, not settled', note: 'Floated in conversation. Nothing here was agreed.', items: proposals },
  ].filter((section) => section.items.length > 0);

  if (!sections.length && !images.length) return null;

  return <section className="recap" aria-label="What this meeting settled">
    <h2>Before you read it back</h2>
    <div className="recap-grid">
      {sections.map((section) => (
        <div key={section.title} className="recap-section">
          <h3>{section.title} <span>{section.items.length}</span></h3>
          {section.note && <p className="recap-note">{section.note}</p>}
          <ul>
            {section.items.map((item) => (
              <li key={item.id}>
                <button onClick={() => onItem(item)}>
                  {noteTitle(item)}
                  {item.due && <em> · due {item.due}</em>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {images.length > 0 && (
        <div className="recap-section">
          <h3>Captured <span>{images.length}</span></h3>
          <ul className="recap-moments">
            {images.map((image) => (
              <li key={image.id}>
                <button onClick={() => onMoment(image.id)}>
                  {safeImageUrl(image.dataUrl) && <img src={image.dataUrl} alt="" />}
                  <span>{image.caption || clock(image.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </section>;
}

/**
 * Every passage a note is built on, beside the note.
 *
 * Verification was a one-way trip: the control opened the first event of the
 * first passage, switched to the Transcript tab, and recorded nothing about where
 * it came from — so checking a note cost you your place in the document, and a
 * note built on several passages could only ever show one of them.
 */
function SourcePanel({ note, passages, onOpen, onClose }: {
  note: { text: string; evidence: Evidence[] };
  passages: { evidence: Evidence; around: Meeting['events'] }[];
  onOpen: (eventId: string) => void;
  onClose: () => void;
}) {
  return <aside className="source-panel" aria-label="Source passages for this note">
    <header>
      <div><span>Source{passages.length === 1 ? '' : 's'}</span><strong>{passages.length} passage{passages.length === 1 ? '' : 's'}</strong></div>
      <button aria-label="Close source passages" onClick={onClose}>×</button>
    </header>
    <blockquote className="source-note">{note.text || '(empty note)'}</blockquote>
    <ol className="source-list">
      {passages.map(({ evidence, around }, i) => (
        <li key={`${evidence.eventIds.join('|')}-${i}`}>
          <div className="source-meta">
            <span>{evidence.speakerLabel === 'YOU' ? 'You' : evidence.speakerLabel === 'SPEAKER' ? 'Others' : evidence.speakerLabel}</span>
            <span className="dim">{stamp(evidence)}</span>
          </div>
          <p className="source-quote">{evidence.quote}</p>
          {around.length > 0 && (
            <p className="source-around">
              {around.map((event) => (
                <span key={event.id} className={evidence.eventIds.includes(event.id) ? 'matched' : ''}>{event.text} </span>
              ))}
            </p>
          )}
          {evidence.eventIds[0] && (
            <button className="source-open" onClick={() => onOpen(evidence.eventIds[0]!)}>Open in transcript ↗</button>
          )}
        </li>
      ))}
    </ol>
    <p className="rubric">Every note points at what was said. Correct a passage in the transcript and the note follows.</p>
  </aside>;
}

/** What kind of pair this is, in the words a reader would use. */
const RELATION_COPY: Record<ItemRelation['kind'], { lead: string; join: string }> = {
  'request-commitment': { lead: 'Asked for earlier, and this may be the answer to it', join: 'Same commitment' },
  'proposal-decision': { lead: 'Raised earlier, and this may be what settled it', join: 'Resolved by this' },
};

function ItemCard({
  item, active, context, boosts, onEvidence, onFullTranscript, onUpdate,
  relation, relatedTitle, onJoin, onReject, joined, onSeparate,
}: {
  item: Item;
  active: boolean;
  context: Meeting['events'];
  boosts: string[];
  onEvidence: (itemId: string, eventId: string, at: number) => void;
  onFullTranscript: (eventId: string) => void;
  onUpdate: (id: string, patch: ItemPatch) => void;
  relation?: ItemRelation | undefined;
  relatedTitle?: string | undefined;
  onJoin: (relation: ItemRelation) => void;
  onReject: (relation: ItemRelation) => void;
  /** Items this one absorbed, by the reader's own decision. */
  joined: { id: string; title: string }[];
  onSeparate: (item: Item, otherId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(noteTitle(item));

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
          {item.confirmed && !item.needsReview && <span className="confirmed">confirmed by you</span>}
          {item.needsReview && <span className="review">source changed · review again</span>}
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
          <h3 className={`title${item.completed ? ' completed' : ''}`}>{item.category === 'action' && <input className="action-check" type="checkbox" aria-label={`Complete: ${noteTitle(item)}`} checked={!!item.completed} onChange={(e) => onUpdate(item.id, { completed: e.target.checked })} />}{noteTitle(item)}</h3>
        )}

        {/* What this item absorbed, and a way to undo it.
            `Item.related` was being written and never read, so joining two items
            made one of them vanish into Dismissed with nothing to say where it
            went — and no way back, in a product whose whole claim is that every
            item can be corrected. */}
        {joined.length > 0 && (
          <div className="item-joined">
            {joined.map((other) => (
              <p key={other.id}>
                <span>Joined with</span> “{other.title}”
                <button onClick={() => onSeparate(item, other.id)}>Separate again</button>
              </p>
            ))}
          </div>
        )}

        {/* A question, never a merge. Two items about one commitment cannot be
            joined by rule — the de-duplication pass is exact, and everything that
            differs here is exactly what it compares. Only the reader can say these
            were the same thing, so only the reader does. */}
        {relation && relatedTitle && (
          <div className="item-relation">
            <p><span>{RELATION_COPY[relation.kind].lead}</span> “{relatedTitle}”</p>
            <p className="item-relation-why">Both mention {relation.shared.map((w) => `“${w}”`).join(', ')}.</p>
            <div className="item-relation-actions">
              <button onClick={() => onJoin(relation)}>{RELATION_COPY[relation.kind].join}</button>
              <button onClick={() => onReject(relation)}>Not related</button>
            </div>
          </div>
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
        <div className="review-actions"><button disabled={!!item.confirmed && !item.needsReview} onClick={() => onUpdate(item.id, { confirmed: true, needsReview: false })}>{item.confirmed && !item.needsReview ? 'Confirmed' : item.category === 'action' && item.assignee === 'unassigned' ? 'Confirm · leave unassigned' : 'Confirm'}</button>{item.category === 'action' && item.assignee === 'unassigned' && <button onClick={() => onUpdate(item.id, { assignee: 'you', confirmed: true, needsReview: false })}>Assign to me</button>}<button onClick={() => { setDraft(noteTitle(item)); setEditing(true); }}>Correct</button><button onClick={() => onUpdate(item.id, { dismissed: true })}>Dismiss</button></div>
        <details className="note-options"><summary>Edit note</summary><div className="controls">
          <button onClick={() => { setDraft(noteTitle(item)); setEditing(true); }}>Edit</button>
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

/** The speech immediately around one cited passage, for reading it in context. */
function evidenceContext(meeting: Meeting, evidence: Evidence): Meeting['events'] {
  const index = meeting.events.findIndex((event) => event.id === evidence.eventIds[0]);
  if (index < 0) return [];
  return meeting.events.slice(Math.max(0, index - 1), index + 2);
}

function transcriptContext(meeting: Meeting, item: Item): Meeting['events'] {
  const eventId = item.evidence[0]?.eventIds[0];
  const index = meeting.events.findIndex((event) => event.id === eventId);
  if (index < 0) return [];
  return meeting.events.slice(Math.max(0, index - 1), index + 2);
}
