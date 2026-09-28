import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NotesWorkspace, OPEN_AT_KEY, OPEN_VIEW_KEY } from './NotesWorkspace';
import { NotesDocument } from './NotesDocument';
import { readMeetingImage } from '../meetingImages';
import { acceptsAcknowledgment, bridge, compareNotesDocuments, meetingMutation, mutateMeeting, notesMetadataDifference, mergeGeneratedNotes, notesCapability, preserveGeneratedConflict, reconcileMeetingUpdate, toMarkdown, transcriptTimeline, refreshMeetingNotes, preserveNoteEdits, editableDocument, hasSmartNotes, insertMeetingImage, meetingImagePassage, meetingImageContext, meetingImageTime, previewTranscriptCorrection, safeImageUrl, toHTML, transcriptEventTime } from '@excerpt/core';
import { Strip } from '@excerpt/ui';
import type { StripMark } from '@excerpt/ui';
import type { Evidence, Meeting, MeetingImage, NoteBlock, NotesDocument as Document, NotesGenerationRequest, NotesProviderStatus, Preferences as Prefs } from '@excerpt/types';

type Style = NotesGenerationRequest['style'];

const clock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** A meeting's length. `clock` reads as a time of day at this size ("24:00"). */
export const meetingLength = (ms: number) => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
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

/**
 * Where the reader was before a side trip to a source, a moment, the transcript or
 * detailed review. Browser globals are read defensively: the component tests run
 * without a DOM, and a missing one must never break the navigation itself.
 */
interface ReturnPoint { y: number; focus: HTMLElement | null; key?: string }
const here = (): ReturnPoint => {
  const focus = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Controls re-rendered by the view switch carry a stable name to find them again.
  const key = focus?.dataset.returnId;
  return { y: typeof window.scrollY === 'number' ? window.scrollY : 0, focus, ...(key ? { key } : {}) };
};
const nextFrame = (run: () => void) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
};

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

export function Notes({ meeting: initial, initialSaveFailed = false, onSaved }:
  { meeting: Meeting; prefs?: Prefs | null; initialSaveFailed?: boolean; onSaved?: (meeting: Meeting) => void }) {
  const [meeting, setMeeting] = useState(initial);
  const [focusedEvent, setFocusedEvent] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<{ text: string; evidence: Evidence[] } | null>(null);
  const [selectedMoment, setSelectedMoment] = useState<string | null>(null);
  const [expandedMoment, setExpandedMoment] = useState(false);
  const [position, setPosition] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [tab, setTab] = useState<'notes' | 'transcript'>('transcript');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>(initialSaveFailed ? 'failed' : 'saved');
  const [running, setRunning] = useState<'' | 'refresh' | Style>('');
  const [generationMessage, setGenerationMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const [generationError, setGenerationError] = useState<{ message: string; style?: Style } | null>(null);
  const [retryingAutomatic, setRetryingAutomatic] = useState(false);
  const [providerStatus, setProviderStatus] = useState<NotesProviderStatus | undefined>(undefined);
  const [statusRead, setStatusRead] = useState(!bridge()?.getNotesProviderStatus);
  const requestToken = useRef(0);
  const generating = running !== '';
  const saveVersion = useRef(0);
  const latestMeeting = useRef(meeting);
  const durableMeeting = useRef(initial);
  const pendingSaves = useRef(new Set<number>());
  const [correction, setCorrection] = useState<{ eventId: string; text: string } | null>(null);
  const [imageError, setImageError] = useState('');
  const [importing, setImporting] = useState(false);
  // What the reader would actually end up with, kept beside the wording it came from
  // so it can be re-merged against whatever the document says at the moment they
  // accept it rather than against whatever it said when the request was made.
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [wordingUndo, setWordingUndo] = useState<{ before: Document; after: Document; sourceRevision: number } | null>(null);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});
  const correctButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const aside = useRef<HTMLElement | null>(null);
  const returnPoints = useRef<ReturnPoint[]>([]);
  const viewPositions = useRef<Partial<Record<'notes' | 'transcript', ReturnPoint>>>({});
  const pendingReturn = useRef<ReturnPoint | null>(null);
  const [returnRequest, setReturnRequest] = useState(0);
  const [transcriptMessage, setTranscriptMessage] = useState('');

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
    setWordingUndo(null);
    const version = ++saveVersion.current;
    latestMeeting.current = next;
    setMeeting(next);
    setSaveState('saving');
    pendingSaves.current.add(version);

    const send = async (desired: Meeting, base: Meeting, attempts = 0): Promise<Meeting> => {
      const mutation = meetingMutation(base, desired);
      if (!mutation) return base;
      const acknowledgment = await mutateMeeting(mutation, [...(base.images ?? []), ...(desired.images ?? [])]);
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
        onSaved?.(authoritative);
      }
      setSaveState('saved');
    }).catch(() => {
      if (version === saveVersion.current) setSaveState('failed');
    }).finally(() => {
      pendingSaves.current.delete(version);
    });
  };

  const noteDocument = useMemo(() => editableDocument(meeting), [meeting]);
  const [focusBlock, setFocusBlock] = useState<string | null>(null);
  const smartNotesReady = hasSmartNotes(meeting);
  const writingNotes = retryingAutomatic || meeting.generationStatus?.state === 'queued' || meeting.generationStatus?.state === 'running';
  const hasTranscript = meeting.events.some((event) => event.isFinal && event.text.trim());
  const timeline = useMemo(() => transcriptTimeline(meeting.events, meeting.images), [meeting.events, meeting.images]);
  /** Close the inline editor and return focus to the line's own Correct button. */
  const closeCorrection = (eventId: string) => {
    setCorrection(null);
    nextFrame(() => correctButtons.current[eventId]?.focus());
  };
  const editDocument = (notes: Document) => {
    const captions = new Map((notes.blocks ?? []).filter((block) => block.imageId)
      .map((block) => [block.imageId!, block.text]));
    const currentImages = latestMeeting.current.images;
    const updatedImages = currentImages?.map((image) => {
      const caption = captions.get(image.id);
      return caption !== undefined && caption !== image.caption ? { ...image, caption } : image;
    });
    const next = { ...latestMeeting.current, notes,
      ...(currentImages ? { images: updatedImages!.some((image, index) => image !== currentImages[index])
        ? updatedImages! : currentImages } : {}) };
    delete next.suggestedNotes;
    persist(next);
  };
  const queueImages = (files: File[], origin: MeetingImage['origin'] = 'import') => {
    if (!files.length) return;
    setImageError('');
    setImporting(true);
    const target = latestMeeting.current;
    void (async () => {
      try {
        const live = !target.endedAt && target.draftRevision !== undefined;
        const at = live ? await bridge()?.getLiveMeetingTime(target.id) : 0;
        if (at === undefined) throw new Error('The native meeting clock is unavailable.');
        const capturedAt = new Date().toISOString();
        const images = await Promise.all(files.map(async (file) => {
          const image = await readMeetingImage(file, at, capturedAt, origin);
          return live ? image : { ...image, timeKnown: false };
        }));
        if (latestMeeting.current.id !== target.id) return;
        let next = latestMeeting.current;
        for (const image of images) next = insertMeetingImage(next, image);
        persist(next);
      } catch (error) { setImageError(error instanceof Error ? error.message : 'Could not import that image.'); }
      finally { setImporting(false); }
    })();
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

  const writeNotes = async () => {
    const host = bridge();
    if (!host || writingNotes || isLiveDraft || !hasTranscript || !providerStatus) return;
    setRetryingAutomatic(true);
    setGenerationError(null);
    setTab('notes');
    try {
      const updated = await host.retryAutomaticNotes(latestMeeting.current.id);
      const next = reconcileMeetingUpdate(updated, durableMeeting.current, latestMeeting.current, pendingSaves.current.size > 0);
      durableMeeting.current = updated;
      latestMeeting.current = next;
      setMeeting(next);
      // The app keeps its own copy for reopening this meeting from the sidebar.
      onSaved?.(updated);
    } catch (error) {
      setGenerationError({ message: error instanceof Error ? error.message : 'Could not write notes. Your transcript and screenshots are saved.' });
    } finally {
      setRetryingAutomatic(false);
    }
  };

  // So Preferences can offer the way back to the notes this was opened from.
  const rememberReturn = () => {
    try { sessionStorage.setItem('excerpt:return-to', meeting.id); } catch { /* the back button still works */ }
  };

  const isLiveDraft = !meeting.endedAt && meeting.draftRevision !== undefined;
  // A bridge is not itself a provider. Until the host has answered, nothing that
  // needs a provider is offered.
  const capability = notesCapability({
    isLiveDraft, hasTranscript: meeting.events.length > 0, native: true,
    hasProviderCall: !!bridge()?.summarizeNotes && statusRead,
    status: providerStatus,
  });
  const duration = Math.max(1, ...meeting.events.map(transcriptEventTime), ...(meeting.images ?? []).filter((i) => i.timeKnown !== false).map(meetingImageTime), meeting.endedAt ? new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime() : 0);

  const marks: StripMark[] = (meeting.images ?? []).filter((image) => image.timeKnown !== false).map((image) => ({
    id: `image:${image.id}`, at: meetingImageTime(image), label: image.caption || 'Captured moment', kind: 'image' as const,
  }));

  const scrollBehavior = () =>
    typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'smooth' as const : 'auto' as const;

  /** Remember the reader's place in the document before leaving it. */
  const leave = () => { returnPoints.current.push(here()); };
  /** Come back to exactly that place: scroll position and the control they used. */
  const comeBack = () => {
    const point = returnPoints.current.pop();
    if (!point) return;
    pendingReturn.current = point;
    setReturnRequest((n) => n + 1);
  };
  useLayoutEffect(() => {
    const point = pendingReturn.current;
    if (!point) return;
    pendingReturn.current = null;
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: point.y, behavior: 'auto' });
    // A correction can replace the block that was focused; the title is the
    // nearest stable place in the document rather than the top of the window.
    const named = point.key && typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>(`[data-return-id="${point.key}"]`) : null;
    const target = point.focus?.isConnected ? point.focus : named
      ?? (typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.document-title') : null);
    target?.focus({ preventScroll: true });
  }, [returnRequest]);
  const showView = (next: 'notes' | 'transcript') => {
    if (next === tab) return;
    viewPositions.current[tab] = here();
    setTab(next);
    pendingReturn.current = viewPositions.current[next] ?? { ...here(), y: 0 };
    setReturnRequest((value) => value + 1);
  };
  const asideOpen = sourceNote !== null || selectedMoment !== null;
  /** Open the source or moment panel; only the first opening records a return point. */
  const openAside = () => {
    // From another view, the point recorded on leaving the document already says
    // where to return; a panel opened over an open panel reuses the first one's.
    if (tab !== 'notes') { setTab('notes'); if (asideOpen) returnPoints.current.pop(); return; }
    if (!asideOpen) leave();
  };
  const closeAside = () => {
    setSourceNote(null); setSelectedMoment(null);
    comeBack();
  };

  const openMoment = (id: string) => {
    const image = meeting.images?.find((candidate) => candidate.id === id);
    if (!image) return;
    if (!asideOpen) leave();
    setSourceNote(null);
    setSelectedMoment(id);
    setExpandedMoment(false);
    setPosition(meetingImageTime(image));
  };

  const selectMark = (id: string) => {
    if (id.startsWith('image:')) openMoment(id.slice(6));
  };

  const openTranscript = (eventId: string) => {
    setFocusedEvent(eventId);
    showView('transcript');
  };

  /** Show every passage a note cites, without leaving the document to do it. */
  const openSource = (note: { text: string; evidence: Evidence[] }) => {
    openAside();
    setSourceNote(note);
    setSelectedMoment(null);
  };
  const openBlockSource = (block: NoteBlock) => openSource(block);

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
      const view = sessionStorage.getItem(OPEN_VIEW_KEY);
      sessionStorage.removeItem(OPEN_VIEW_KEY);
      if (view === `notes:${meeting.id}`) setTab('notes');
      target = sessionStorage.getItem(OPEN_AT_KEY);
      if (target) sessionStorage.removeItem(OPEN_AT_KEY);
    } catch { /* nothing to restore */ }
    if (target && meeting.events.some((e) => e.id === target)) openTranscript(target);
    // Only on arrival at a meeting, never on a later re-render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  // An opened panel takes focus, so a keyboard reader lands in what they asked for;
  // closing it hands focus back to the control that opened it (see comeBack).
  useEffect(() => {
    if (!asideOpen || !aside.current) return;
    aside.current.focus({ preventScroll: true });
    aside.current.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, [tab, sourceNote, selectedMoment]);

  /** Scrubbing the rail lands on the nearest thing actually said. */
  const scrub = (ms: number) => {
    if (!meeting.events.length) return;
    showView('transcript');
    setSelectedMoment(null);
    setPosition(ms);
    const nearest = meeting.events.reduce((best, e) =>
      Math.abs(transcriptEventTime(e) - ms) < Math.abs(transcriptEventTime(best) - ms) ? e : best, meeting.events[0]!);
    setFocusedEvent(nearest.id);
    rows.current[nearest.id]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };

  /**
   * A blank page, not excerpts. With no saved notes `noteDocument` is built from the
   * transcript, which is what "Write notes" is for; screenshots already placed in a
   * capture draft stay.
   */
  const startWriting = () => {
    const base: Document = meeting.notes ? noteDocument : { version: 1, method: 'extractive', keyPoints: [], topics: [], blocks: [] };
    const id = crypto.randomUUID();
    editDocument({ ...base, blocks: [...(base.blocks ?? []), { id, kind: 'paragraph', text: '', evidence: [], userEdited: true }] });
    setFocusBlock(id);
  };

  const exportSnapshot = (): Meeting => smartNotesReady
    ? { ...meeting, notes: noteDocument }
    : meeting;

  const copy = async () => {
    try {
      const snapshot = exportSnapshot();
      const markdown = toMarkdown(snapshot);
      const html = toHTML(snapshot);
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        })]);
      } else await navigator.clipboard.writeText(markdown);
      setCopyFailed(false); setCopied(true); setGenerationMessage('Notes copied.');
      setTimeout(() => setCopied(false), 1800);
    } catch { setCopyFailed(true); }
  };

  const download = async () => {
    const markdown = toMarkdown(exportSnapshot());
    const filename = `${meeting.title.replace(/\W+/g, '-').toLowerCase()}.md`;

    // Inside Excerpt's own window a browser download goes somewhere the user cannot
    // find, which reads as the export having failed. The host opens a real save panel.
    const host = bridge();
    if (host) {
      try {
        const outcome = await host.exportMarkdown(filename, markdown);
        setExportMessage(outcome === 'saved' ? 'Markdown exported.' : 'Markdown export cancelled.');
      } catch (error) {
        setExportMessage(error instanceof Error ? error.message : 'Could not export Markdown.');
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
    const html = toHTML(exportSnapshot());
    const filename = `${meeting.title.replace(/\W+/g, '-').toLowerCase()}.html`;
    const host = bridge();
    if (host?.exportHTML) {
      try {
        const outcome = await host.exportHTML(filename, html);
        setExportMessage(outcome === 'saved' ? 'HTML exported.' : 'HTML export cancelled.');
      } catch (error) {
        setExportMessage(error instanceof Error ? error.message : 'Could not export HTML.');
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
    if (!moment) return;
    const current = latestMeeting.current;
    const notes = current.notes?.blocks ? { ...current.notes, blocks: current.notes.blocks.map((block) => block.imageId === moment.id ? { ...block, text, userEdited: true } : block) } : current.notes;
    const next = { ...current, ...(notes ? { notes } : {}), images: (current.images ?? []).map((image) => image.id === moment.id ? { ...image, caption: text, needsReview: false } : image) };
    delete next.suggestedNotes;
    persist(next);
  };
  const anchorMoment = (at: number) => {
    if (!moment) return;
    const current = latestMeeting.current;
    const images = (current.images ?? []).map((image) => image.id === moment.id
      ? { ...image, anchorAt: at, timeKnown: true, context: meetingImageContext(current, at) }
      : image);
    const notes = current.notes?.blocks ? { ...current.notes, blocks: current.notes.blocks.map((block) => block.imageId === moment.id ? { ...block, at } : block) } : current.notes;
    persist({ ...current, images, ...(notes ? { notes } : {}) });
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
    const before = editableDocument(latestMeeting.current);
    const after = mergeGeneratedNotes(before, candidate.produced);
    editDocument(after);
    setWordingUndo({ before, after, sourceRevision: candidate.revision });
    setCandidate(null);
    setGenerationMessage('Applied. Your writing, images and image positions were kept.');
  };

  return (
    <NotesWorkspace currentId={meeting.id}>
    <div className="notebook-toolbar"><a href="#/meetings">All meetings <span>/</span> Meeting</a><div><span className={`save-state ${saveState}`} role="status">{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved — export a copy' : 'Saved on this device'}</span><details className="toolbar-menu"><summary>Export</summary><div><button onClick={() => { void copy(); }}>{copied ? 'Copied ✓' : 'Copy meeting'}</button><button onClick={() => { void download(); }}>Save Markdown…</button><button onClick={() => { void exportHTML(); }}>Save HTML with images…</button></div></details></div></div>
    <div className="notes notes-reading">
      <header className="masthead">
        <div className="notebook-date">{new Date(meeting.startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} <span>·</span> {meetingLength(duration)} <span>·</span> {isLiveDraft ? 'Live meeting' : meeting.processing === 'demo' ? 'Legacy meeting' : meeting.processing === 'cloud' ? 'Cloud transcription' : 'On-device transcription'}</div>
        <input className="document-title" aria-label="Meeting title" value={meeting.title} onChange={(e) => persist({ ...meeting, title: e.target.value })} />
        <p className="notebook-description">{tab === 'transcript'
          ? isLiveDraft ? 'Your transcript appears here as speech settles. Add screenshots while you listen.' : 'The conversation, with screenshots at the moments they were captured.'
          : 'Write in your own words, or turn the transcript into a shorter document.'}</p>
        {copyFailed && <p role="status" className="rubric">Could not copy to the clipboard. Use Export to save this meeting.</p>}
        {exportMessage && <p role="status" className="rubric">{exportMessage}</p>}
        <nav className="notebook-view-actions" aria-label="Meeting views">
          <button data-return-id="view-transcript" aria-pressed={tab === 'transcript'} onClick={() => showView('transcript')}>Transcript</button>
          <button data-return-id="view-notes" aria-pressed={tab === 'notes'} onClick={() => showView('notes')}>Notes{writingNotes ? ' · Writing…' : ''}</button>
        </nav>
        {marks.length > 0 && <details className="notebook-timeline"><summary>Jump to a captured moment</summary><Strip duration={duration} position={position} marks={marks} onScrub={scrub} onSelect={selectMark} {...(selectedMoment ? { selectedId: `image:${selectedMoment}` } : {})} /><p className="rubric">Diamonds mark screenshots. Transcript times without audio alignment are approximate.</p></details>}
      </header>
      {moment && <MomentViewer key={moment.id} panelRef={(el) => { aside.current = el; }} image={moment} caption={momentBlock?.text ?? moment.caption} passage={momentPassage} expanded={expandedMoment} duration={duration} onCaption={captionMoment} onTime={anchorMoment} onExpand={() => setExpandedMoment((value) => !value)} onClose={closeAside} onSource={openTranscript} />}
      <div hidden={tab !== 'notes'}>
      {!smartNotesReady && <section className="smart-notes-empty" aria-label="Create notes" aria-busy={writingNotes}>
        <span className="eyebrow">Optional notes</span>
        <h2>{writingNotes ? 'Writing your notes…' : 'A shorter way back to the meeting.'}</h2>
        <p>{writingNotes ? 'You can return to the transcript while this finishes. Your notes will appear here.'
          : isLiveDraft ? 'Write your own notes while you listen. After the meeting, you can also generate notes from the transcript.'
          : hasTranscript ? 'Turn the conversation into editable notes with links to the words they came from, or start with a blank page.'
          : 'There is no transcript to summarize. You can still write your own notes and keep screenshots with this meeting.'}</p>
        {!writingNotes && <>
          {!isLiveDraft && hasTranscript && <p className="notes-destination">{!statusRead ? 'Checking note settings…'
            : !providerStatus ? 'Note settings could not be checked. Reopen this meeting to try again.'
            : providerStatus.selected === 'openai' ? 'Uses OpenAI with your key. Transcript text and screenshot captions are sent to OpenAI; images stay on this Mac.'
            : providerStatus.ready ? 'Written on this Mac with Apple Intelligence.'
            : 'Apple Intelligence is unavailable. Excerpt will make local excerpts from your transcript.'}</p>}
          <div className="actions">
            {!isLiveDraft && hasTranscript && <button className="primary-action" disabled={!statusRead || !providerStatus || saveState !== 'saved'} onClick={() => { void writeNotes(); }}>{meeting.generationStatus?.state === 'failed' || meeting.generationStatus?.state === 'cancelled' ? 'Try writing notes again' : 'Write notes'}</button>}
            <button onClick={startWriting}>Write my own</button>
          </div>
          {!isLiveDraft && hasTranscript && <a className="notes-settings-link" href="#/preferences" onClick={rememberReturn}>Note settings ↗</a>}
        </>}
        {(meeting.generationStatus?.state === 'failed' || meeting.generationStatus?.state === 'cancelled') && <p role="alert">{meeting.generationStatus.message ?? 'Notes could not be written. Your transcript and screenshots are saved.'}</p>}
        {generationError && <p role="alert">{generationError.message}</p>}
      </section>}
      {smartNotesReady && <>
      {sourceNote && <SourcePanel panelRef={(el) => { aside.current = el; }} note={sourceNote} passages={sourcePassages}
        onOpen={openTranscript} onClose={closeAside} />}
      {!meeting.generationStatus && !isLiveDraft && hasTranscript && <div className="notes-compose">
        <div><strong>Add notes from the transcript</strong><p>{providerStatus?.selected === 'openai' ? 'Sends transcript text and screenshot captions to OpenAI with your key. Your writing is kept.' : 'Uses the selected on-device note provider. Your writing is kept.'} <a href="#/preferences" onClick={rememberReturn}>Note settings ↗</a></p></div>
        <button disabled={writingNotes || !statusRead || !providerStatus || saveState !== 'saved'} onClick={() => { void writeNotes(); }}>Write notes</button>
      </div>}
      <div className="document-toolbar">
        {/* What produced this wording, then what the buttons beside it can actually
            do here — before they are pressed, not in the message afterwards. */}
        <div className="document-provenance">
          <span>{isLiveDraft ? 'Live draft · saved as you write' : noteDocument.method === 'cloud' ? `Enhanced with OpenAI · ${noteDocument.generation?.model ?? 'BYOK'}` : noteDocument.method === 'on-device' ? 'Enhanced on this Mac' : 'From your transcript'}</span>
          {capability.explanation && <small>{capability.explanation}{capability.settings && capability.enhancements.length === 0
            && <> <a href="#/preferences" onClick={rememberReturn}>Note enhancement settings</a></>}</small>}
        </div>
        {(capability.refresh || capability.enhancements.length > 0) && <details className="generation-actions"><summary>Rewrite options</summary><div>
          {capability.enhancements.map((enhancement) => <button key={enhancement.style} disabled={generating} onClick={() => { void enhance(enhancement.style); }}>
            {running === enhancement.style ? 'Improving notes…' : enhancement.label}
          </button>)}
          {capability.refresh && <button disabled={generating} onClick={refreshExcerpts}>{running === 'refresh' ? 'Refreshing excerpts…' : 'Refresh excerpts'}</button>}
        </div></details>}
      </div>
      {/* Why these are the transcript-based notes, where they are read rather than
          only in the menu bar the moment the meeting ended. Suppressed once the user
          has asked for a regeneration, whose own message is the current answer. */}
      {(meeting.generationStatus?.state === 'queued' || meeting.generationStatus?.state === 'running')
        && <p className="rubric" role="status">Writing notes… You can keep editing while this finishes.</p>}
      {(meeting.generationStatus?.state === 'failed' || meeting.generationStatus?.state === 'cancelled')
        && <p className="rubric" role="alert">{meeting.generationStatus.message ?? 'Writing notes stopped. Your transcript and current notes are intact.'} <button disabled={retryingAutomatic} onClick={() => { void writeNotes(); }}>{retryingAutomatic ? 'Retrying…' : 'Try again'}</button></p>}
      {noteDocument.notice && !generationMessage && <p className="rubric" role="status">{noteDocument.notice}</p>}
      {generationMessage && <p className="rubric" role="status">{generationMessage}</p>}
      {wordingUndo && (meeting.sourceRevision ?? 0) === wordingUndo.sourceRevision
        && compareNotesDocuments(noteDocument, wordingUndo.after) === 'same'
        && <button className="writing-undo" onClick={() => {
          editDocument(wordingUndo.before);
          setGenerationMessage('Previous wording restored.');
        }}>Undo rewrite</button>}
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
      <fieldset className="notes-editor" disabled={generating}>
      <NotesDocument document={noteDocument} images={meeting.images ?? []} onChange={editDocument} onSource={openBlockSource} onImages={queueImages} onMoment={openMoment} selectedImageId={selectedMoment} focusBlockId={focusBlock} />
      </fieldset>
      </>}
      </div>
      {/* Speech and captures share one chronological reading surface. */}
      <section className="transcript" aria-label="Meeting transcript" hidden={tab !== 'transcript'} onPaste={(event) => {
        const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
        if (files.length) { event.preventDefault(); queueImages(files, 'paste'); }
      }} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={(event) => {
        if (event.dataTransfer.files.length) { event.preventDefault(); queueImages(Array.from(event.dataTransfer.files), 'drop'); }
      }}>
        <div className="transcript-toolbar"><div><h2>{isLiveDraft ? 'Live transcript' : 'Transcript & screenshots'}</h2><p>{isLiveDraft ? 'Speech is saved as it settles.' : 'Correct any passage. The original wording is kept.'}</p></div>
          <button disabled={importing} onClick={() => imageInput.current?.click()}>Add image…</button>
          <input ref={imageInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" aria-label="Add images to transcript" onChange={(event) => { queueImages(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
        </div>
        {writingNotes && <p className="rubric" role="status">Writing notes in the background…</p>}
        {importing && <p className="rubric" role="status">Adding image…</p>}
        {imageError && <p className="rubric" role="alert">{imageError}</p>}
        {/* The way back. Opening a passage from the source panel switched tabs and
            left nothing saying where the reader had come from, so checking a note
            cost them their place. The panel itself is still open behind this. */}
        {sourceNote && (
          <button className="return-to-note" onClick={() => showView('notes')}>
            ← Back to the note you were checking
            <span>“{sourceNote.text.length > 60 ? `${sourceNote.text.slice(0, 60)}…` : sourceNote.text}”</span>
          </button>
        )}
        {transcriptMessage && <p className="rubric" role="status">{transcriptMessage}</p>}
        {timeline.length === 0 && <p className="rubric">{isLiveDraft ? 'Listening. Finalized speech will appear here; you can add a screenshot at any time.' : 'No transcript or screenshots were captured. You can add an image or write your own notes.'}</p>}
        {timeline.map((entry) => entry.kind === 'image' ? (
          <figure className="transcript-capture" key={`image:${entry.image.id}`}>
            <button type="button" onClick={() => openMoment(entry.image.id)} aria-label={`Open screenshot ${entry.image.timeKnown === false ? 'with unknown time' : `at ${clock(meetingImageTime(entry.image))}`}`}>
              {safeImageUrl(entry.image.dataUrl)
                ? <img src={entry.image.dataUrl} alt={entry.image.caption || 'Meeting screenshot'} />
                : <span>Image unavailable</span>}
            </button>
            <figcaption><span>{entry.image.timeKnown === false ? 'Time unknown' : clock(meetingImageTime(entry.image))} · Screenshot</span>{entry.image.caption && <span>{entry.image.caption}</span>}</figcaption>
          </figure>
        ) : (
          <article className={`turn${entry.turn.role === 'you' ? ' mine' : ''}`} key={`turn:${entry.turn.id}`}>
            <header>
              <span className="who">{entry.turn.role === 'you' ? 'You' : entry.turn.speakerLabel === 'SPEAKER' ? 'Meeting audio' : entry.turn.speakerLabel}</span>
              <span className="at">{stamp(entry.turn.events[0]!)}</span>
            </header>
            <div className="said">
              {entry.turn.events.map((e) => (
                <p
                  key={e.id}
                  ref={(el) => { rows.current[e.id] = el; }}
                  className={`line-row${focusedEvent === e.id ? ' focused' : ''}`}
                >
                  {e.text}
                  <button className="correct-transcript" ref={(el) => { correctButtons.current[e.id] = el; }}
                    aria-expanded={correction?.eventId === e.id}
                    onClick={() => { setTranscriptMessage(''); setCorrection({ eventId: e.id, text: e.text }); }}>Correct</button>
                  {e.originalText !== undefined && <span className="correction-original">Original: {e.originalText} · {e.corrections?.length ?? 1} correction(s)</span>}
                  {correction?.eventId === e.id && correctionPreview && <CorrectionEditor
                    text={correction.text} changes={correctionPreview.changes}
                    canApply={!!correction.text.trim() && correctionPreview.meeting !== meeting}
                    onText={(text) => setCorrection({ ...correction, text })}
                    onApply={() => {
                      persist(correctionPreview.meeting); setCandidate(null); setGenerationError(null);
                      setGenerationMessage('Correction saved. Any generated wording that used it is marked for review; regenerating refreshes it.');
                      setTranscriptMessage(smartNotesReady ? 'Correction saved. Notes that used this passage were updated or marked for review.' : 'Correction saved. The original wording is kept.');
                      closeCorrection(e.id);
                    }}
                    onCancel={() => closeCorrection(e.id)} />}
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

function MomentViewer({ image, caption, passage, expanded, duration, onCaption, onTime, onExpand, onClose, onSource, panelRef }: {
  panelRef: (element: HTMLElement | null) => void;
  image: MeetingImage; caption: string; passage: Meeting['events']; expanded: boolean; duration: number;
  onCaption: (text: string) => void; onTime: (at: number) => void;
  onExpand: () => void; onClose: () => void; onSource: (id: string) => void;
}) {
  const [timeInput, setTimeInput] = useState(image.timeKnown === false ? '' : clock(meetingImageTime(image)));
  const [timeError, setTimeError] = useState('');
  const origin = image.origin === 'excerpt' ? 'Excerpt capture' : image.origin === 'system-screenshot' ? 'macOS screenshot' : image.origin === 'drop' ? 'Dropped image' : image.origin === 'paste' ? 'Pasted image' : image.origin === 'import' ? 'Imported image' : 'Captured image';
  return <aside id="selected-moment" className="moment-viewer" ref={panelRef} tabIndex={-1}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }} aria-label={image.timeKnown === false ? 'Captured moment with unknown meeting time' : `Captured moment at ${clock(meetingImageTime(image))}`}>
    <header><div><span>Captured moment</span><strong>{image.timeKnown === false ? 'Time unknown' : clock(meetingImageTime(image))}</strong></div><button aria-label="Close captured moment" onClick={onClose}>×</button></header>
    <div className="moment-layout">
      <div>{safeImageUrl(image.dataUrl) ? <img src={image.dataUrl} alt={caption || 'Meeting image'} /> : <p>Image unavailable.</p>}<label>Caption<input value={caption} onChange={(event) => onCaption(event.target.value)} placeholder="What should you remember about this?" /></label><small>{origin} · {new Date(image.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
        <form onSubmit={(event) => {
          event.preventDefault();
          const match = /^(\d+):([0-5]\d)$/.exec(timeInput.trim());
          if (!match) { setTimeError('Enter minutes:seconds, for example 12:34.'); return; }
          const at = (Number(match[1]) * 60 + Number(match[2])) * 1000;
          if (at > duration) { setTimeError('Choose a time within this meeting.'); return; }
          setTimeError(''); onTime(at);
        }}><label>Meeting time <input aria-label="Image meeting time" value={timeInput} onChange={(event) => setTimeInput(event.target.value)} placeholder="12:34" /></label><button type="submit">Place at time</button></form>
        {timeError && <p role="alert">{timeError}</p>}{image.needsReview && <p className="source-review-notice">Nearby transcript wording changed. Recheck this moment’s context.</p>}</div>
      <section><h3>Conversation around this moment</h3>{passage.length ? passage.map((event) => <button className="moment-passage" key={event.id} onClick={() => onSource(event.id)}><span>{event.role === 'you' ? 'You' : event.speakerLabel === 'SPEAKER' ? 'Others' : event.speakerLabel} · {stamp(event)}</span>{event.text}</button>) : <p className="moment-empty">{image.timeKnown === false ? 'This image has no meeting time. Set a time above to place it beside the conversation.' : 'No speech settled around this capture. The image is still saved at its original time.'}</p>}{image.timeKnown !== false && <button className="moment-expand" onClick={onExpand}>{expanded ? 'Show nearby passage' : 'Expand passage'}</button>}<p>Nearby speech gives context. It does not claim the words describe the image.</p></section>
    </div>
  </aside>;
}

/** Correct one transcript line in place, beside the words being corrected. */
function CorrectionEditor({ text, changes, canApply, onText, onApply, onCancel }: {
  text: string; changes: { before: string; after: string }[]; canApply: boolean;
  onText: (text: string) => void; onApply: () => void; onCancel: () => void;
}) {
  return <span className="correction-preview" role="group" aria-label="Correct this passage">
    <textarea aria-label="Corrected transcript" value={text} autoFocus onChange={(event) => onText(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } }} />
    <span className="correction-note">The original wording is preserved. Any affected notes are listed below.</span>
    {changes.map((change, index) => <span className="correction-change" key={index}><del>{change.before}</del><span>{change.after}</span></span>)}
    {!changes.length && <span className="correction-note">No generated notes are affected.</span>}
    <span className="correction-actions">
      <button disabled={!canApply} onClick={onApply}>Save correction</button>
      <button onClick={onCancel}>Cancel</button>
    </span>
  </span>;
}

/**
 * Every passage a note is built on, beside the note.
 *
 * Verification was a one-way trip: the control opened the first event of the
 * first passage, switched to the Transcript tab, and recorded nothing about where
 * it came from — so checking a note cost you your place in the document, and a
 * note built on several passages could only ever show one of them.
 */
function SourcePanel({ note, passages, onOpen, onClose, panelRef }: {
  panelRef: (element: HTMLElement | null) => void;
  note: { text: string; evidence: Evidence[] };
  passages: { evidence: Evidence; around: Meeting['events'] }[];
  onOpen: (eventId: string) => void;
  onClose: () => void;
}) {
  return <aside className="source-panel" aria-label="Source passages for this note" ref={panelRef} tabIndex={-1}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
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

/** The speech immediately around one cited passage, for reading it in context. */
function evidenceContext(meeting: Meeting, evidence: Evidence): Meeting['events'] {
  const index = meeting.events.findIndex((event) => event.id === evidence.eventIds[0]);
  if (index < 0) return [];
  return meeting.events.slice(Math.max(0, index - 1), index + 2);
}
