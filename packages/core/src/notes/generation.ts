import type { Evidence, NoteBlock, NotesDocument, NotesGenerationRequest, NotesProviderStatus } from '@excerpt/types';

/**
 * What a note-generation action is allowed to claim, and what it may offer.
 *
 * The toolbar used to render "Improve notes", "Shorter" and "More detail" on every
 * finished meeting. In a browser there is no provider behind any of them, so all
 * three ran the same extractive rebuild and returned the same thirteen excerpts —
 * three buttons, one outcome, and two labels that described work nothing performs.
 * The capability is therefore derived from the environment before anything is drawn,
 * and the sentence explaining it is shown before the button rather than after it.
 */
export interface NotesEnhancement {
  style: NotesGenerationRequest['style'];
  label: string;
}

export interface NotesCapability {
  /** The deterministic rebuild from the transcript. Always ours, never a provider's. */
  refresh: boolean;
  /** Provider rewrites, only when a selected provider says it can be asked. */
  enhancements: NotesEnhancement[];
  /** One sentence, true in this environment, shown before any request is made. */
  explanation: string;
  /** Whether to offer a route to the provider settings. */
  settings: boolean;
}

const ENHANCEMENTS: NotesEnhancement[] = [
  { style: 'balanced', label: 'Improve notes' },
  { style: 'shorter', label: 'Shorter' },
  { style: 'detailed', label: 'More detail' },
];

const NOT_READY: Record<NonNullable<NotesProviderStatus['reason']>, string> = {
  'no-key': 'OpenAI note enhancement is selected, but no API key is stored on this Mac.',
  'model-unavailable': 'Apple Intelligence is not available on this Mac.',
  'model-not-ready': 'Apple Intelligence is still preparing its model.',
  'not-configured': 'No note-enhancement provider is selected.',
};

export function notesCapability(input: {
  isLiveDraft: boolean;
  hasTranscript: boolean;
  native: boolean;
  /** Whether the host exposes a summarize call at all. */
  hasProviderCall?: boolean;
  status?: NotesProviderStatus | undefined;
}): NotesCapability {
  // Capture is still running. Regenerating a document that is still being written is
  // not offered, and this plan does not change that.
  if (input.isLiveDraft) return { refresh: false, enhancements: [], explanation: '', settings: false };

  if (!input.hasTranscript) {
    return {
      refresh: false, enhancements: [], settings: false,
      explanation: 'Add notes or images now. Generated excerpts need transcript text.',
    };
  }

  if (!input.native || !input.hasProviderCall) {
    return {
      refresh: true, enhancements: [], settings: false,
      explanation: 'Uses your transcript to rebuild excerpts. Your writing and images are kept.',
    };
  }

  // A bridge is not a provider. An app that cannot say which provider is selected, or
  // says the selected one cannot be asked, gets the rebuild and a route to settings —
  // never three buttons whose work nothing will do.
  if (!input.status) {
    return {
      refresh: true, enhancements: [], settings: true,
      explanation: 'This app did not report a note-enhancement provider, so only the transcript rebuild is offered.',
    };
  }

  if (!input.status.ready) {
    const reason = input.status.reason
      ? NOT_READY[input.status.reason]
      : 'The selected note-enhancement provider is not ready.';
    return {
      refresh: true, enhancements: [], settings: true,
      explanation: `${reason} Excerpt can still rebuild the excerpts from your transcript.`,
    };
  }

  // "On this Mac" has to be earned, not defaulted to — claiming local processing for a
  // provider that never said so is the one mistake this whole opportunity exists to
  // prevent. And a host that will not say where a transcript goes does not get to send
  // one: an unknown destination is treated as not ready, not as a neutral sentence
  // under three buttons the reader would be pressing blind.
  if (input.status.processing !== 'on-device' && input.status.processing !== 'cloud') {
    return {
      refresh: true, enhancements: [], settings: true,
      explanation: `${input.status.providerName ?? 'The selected provider'} did not say whether it rewrites your notes on this Mac or in the cloud, so Excerpt will not send it your transcript. The rebuild from your transcript is still available.`,
    };
  }

  const where = input.status.processing === 'on-device'
    ? `runs on this Mac with ${input.status.providerName ?? 'the on-device model'}`
    : `sends your transcript to ${input.status.providerName ?? 'the selected provider'}`;
  return {
    refresh: false, enhancements: ENHANCEMENTS, settings: true,
    explanation: `Rewriting ${where}. Your writing and images are kept, and every bullet keeps a quote from your transcript.`,
  };
}

const words = (text: string) => new Set(collapse(text).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean));
const overlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/**
 * How well an incoming block stands in for one already on the page.
 *
 * Sources first, because they are the thing a rebuild is faithful to; wording second,
 * because two bullets drawn from one sentence cite exactly the same source and only
 * their text tells them apart. Zero means "not a counterpart at all".
 */
function affinity(block: NoteBlock, incoming: NoteBlock): number {
  const here = new Set(block.evidence.flatMap((e) => e.eventIds));
  const there = new Set(incoming.evidence.flatMap((e) => e.eventIds));
  const sources = overlap(here, there);
  if (!sources) return 0;
  const exact = evidenceKey(block.evidence) === evidenceKey(incoming.evidence) ? 1 : 0;
  const sameKind = block.kind === incoming.kind ? 1 : 0;
  return exact * 8 + sources * 4 + overlap(words(block.text), words(incoming.text)) * 2 + sameKind;
}

/**
 * The document the reader would actually end up with.
 *
 * Handwritten blocks, generated blocks the reader has edited, and images stay exactly
 * where they are, in the order the reader put them. Everything else is paired with the
 * incoming wording that best stands in for it and replaced by it; incoming wording with
 * no counterpart is appended.
 *
 * Two earlier versions of this got it wrong, in ways worth keeping written down.
 *
 * The first built a set of every event id any protected block cited and dropped **all**
 * incoming wording touching one. That sounds like "don't repeat what the reader has
 * already written" and is not: one transcript event routinely yields several bullets,
 * and a heading cites every event its section does. Editing one bullet deleted its
 * siblings; editing a heading deleted the section.
 *
 * The second paired each block with the *first* incoming block sharing a source,
 * walking the current document in order over a shrinking pool held in the generated
 * document's order. That is only correct while the two orders agree — and the ↑/↓
 * buttons exist precisely so a reader can make them disagree. Move a bullet above its
 * neighbour and the neighbour's replacement was taken by the wrong block: one note
 * vanished and a regenerated twin of the reader's own edited sentence appeared beside
 * it.
 *
 * So the pairing is now decided by fit rather than by position: every candidate pair is
 * scored, the best are assigned first, and each block is used once. Position then only
 * decides where the result sits, which is the reader's business and not ours.
 */
function pairBlocks(currentBlocks: NoteBlock[], incoming: NoteBlock[]) {
  const pairs: { block: number; incoming: number; score: number }[] = [];
  currentBlocks.forEach((block, b) => {
    // An image never stands in for wording, and never has wording stand in for it.
    if (block.kind === 'image') return;
    incoming.forEach((candidate, i) => {
      if (candidate.kind === 'image') return;
      const score = affinity(block, candidate);
      if (score > 0) pairs.push({ block: b, incoming: i, score });
    });
  });
  pairs.sort((x, y) => y.score - x.score || x.block - y.block || x.incoming - y.incoming);

  const matched = new Map<number, NoteBlock>();
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (matched.has(pair.block) || taken.has(pair.incoming)) continue;
    matched.set(pair.block, incoming[pair.incoming]!);
    taken.add(pair.incoming);
  }
  return { matched, taken };
}

/** Match removals alongside surviving siblings; a shared event is not a deletion of every note in it. */
export function withoutDeletedBlocks(current: NotesDocument, generated: NotesDocument): NotesDocument {
  const live = current.blocks ?? [];
  const incoming = generated.blocks ?? [];
  const { matched } = pairBlocks([...live, ...(current.deletedBlocks ?? [])], incoming);
  const removed = new Set([...matched].filter(([index]) => index >= live.length).map(([, block]) => block));
  return { ...generated, blocks: incoming.filter((block) => !removed.has(block)), deletedBlocks: current.deletedBlocks ?? [] };
}

export function mergeGeneratedNotes(current: NotesDocument, generated: NotesDocument): NotesDocument {
  const currentBlocks = current.blocks ?? [];
  const incoming = withoutDeletedBlocks(current, generated).blocks ?? [];
  const { matched, taken } = pairBlocks(currentBlocks, incoming);

  const blocks = currentBlocks.flatMap((block, index): NoteBlock[] => {
    // A protected block still consumes its counterpart, so the reader is never left
    // reading their own sentence and a regenerated one about the same moment.
    if (block.userEdited || block.kind === 'image') return [block];
    const match = matched.get(index);
    if (match) return [match];
    // Nothing was produced for it. A block that cites no source cannot be paired by
    // construction, so dropping it would delete writing on a technicality.
    return block.evidence.length ? [] : [block];
  });
  blocks.push(...incoming.filter((_, i) => !taken.has(i)));
  return { ...generated, blocks, deletedBlocks: current.deletedBlocks ?? [] };
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const evidenceKey = (evidence: Evidence[]) =>
  evidence.map((e) => `${e.eventIds.join('|')} ${collapse(e.quote)}`).join(' / ');
/** Ids and derived timestamps are regenerated every run and say nothing about change. */
const wordingKey = (b: NoteBlock) => `${b.kind} ${collapse(b.text)} ${b.imageId ?? ''} ${b.indent ?? 0}`;
const metadataKey = (b: NoteBlock) => `${evidenceKey(b.evidence)} ${b.needsReview ? 1 : 0} ${b.userEdited ? 1 : 0}`;

/**
 * How the candidate differs from what is on the page, if it differs at all.
 *
 * `same` must never be offered as a replacement to review: a preview of identical
 * text asks the reader to approve nothing, and reads as though work was done. A
 * change confined to sources or review flags is real and still needs consent, but it
 * is not "new wording" and must not be described as any.
 */
/**
 * Who wrote this document, which is not visible in any block.
 *
 * A provider that lands on wording identical to what is already there has still
 * changed something the reader is shown and may have been billed for: the document
 * stops being "From your transcript" and starts being "Enhanced with OpenAI". Leaving
 * provenance out of the comparison threw that away and reported "no changes".
 */
const provenanceKey = (document: NotesDocument) =>
  [document.method, document.generation?.provider, document.generation?.model,
    document.generation?.style].join(' ');

export function compareNotesDocuments(current: NotesDocument, candidate: NotesDocument): 'same' | 'metadata' | 'wording' {
  const a = current.blocks ?? [];
  const b = candidate.blocks ?? [];
  if (a.length !== b.length) return 'wording';
  if (a.some((block, i) => wordingKey(block) !== wordingKey(b[i]!))) return 'wording';
  if (a.some((block, i) => metadataKey(block) !== metadataKey(b[i]!))) return 'metadata';
  return provenanceKey(current) === provenanceKey(candidate) ? 'same' : 'metadata';
}

/**
 * Which half of a `metadata` verdict actually changed, so the page can say so.
 *
 * "The linked sources or review flags differ" is one sentence covering two unrelated
 * changes, and it was printed for both — including for a rewrite whose only difference
 * was who wrote it, where no source and no flag had moved at all. A reader asked to
 * approve a diff of nothing deserves to be told what they are approving.
 */
export function notesMetadataDifference(current: NotesDocument, candidate: NotesDocument): 'sources' | 'provenance' | 'both' {
  const a = current.blocks ?? [];
  const b = candidate.blocks ?? [];
  const sources = a.length !== b.length || a.some((block, i) => metadataKey(block) !== metadataKey(b[i]!));
  const provenance = provenanceKey(current) !== provenanceKey(candidate);
  return sources && provenance ? 'both' : provenance ? 'provenance' : 'sources';
}
