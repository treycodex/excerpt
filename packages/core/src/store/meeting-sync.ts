import type {
  Meeting, MeetingChange, MeetingMutation, MeetingMutationAcknowledgment,
} from '@excerpt/types';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const revision = (meeting: Meeting) => meeting.revision ?? meeting.draftRevision ?? 0;
const documentRevision = (meeting: Meeting) => meeting.documentRevision ?? meeting.draftRevision ?? 0;
const sourceRevision = (meeting: Meeting) => meeting.sourceRevision ?? 0;

const operationId = () => globalThis.crypto?.randomUUID?.()
  ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Build one atomic, typed operation from an editor transition. */
export function meetingMutation(before: Meeting | undefined, after: Meeting): MeetingMutation | undefined {
  if (!before) {
    return {
      operationId: operationId(), meetingId: after.id,
      baseRevision: 0, baseDocumentRevision: 0, baseSourceRevision: 0,
      changes: [{ type: 'create', meeting: after }],
    };
  }
  const changes: MeetingChange[] = [];
  if (before.title !== after.title) changes.push({ type: 'setTitle', title: after.title });

  const sourceChanged = !equal(before.events, after.events)
    || sourceRevision(before) !== sourceRevision(after);
  if (sourceChanged) {
    changes.push({
      type: 'correctTranscript', events: after.events, items: after.items,
      document: after.notes ?? null, suggestedNotes: after.suggestedNotes ?? null,
      images: after.images ?? [], sourceRevision: sourceRevision(after),
    });
  } else {
    const beforeImages = new Map((before.images ?? []).map((image) => [image.id, image]));
    const additions = (after.images ?? []).filter((image) => !beforeImages.has(image.id));
    const changedImages = (after.images ?? []).filter((image) => {
      const old = beforeImages.get(image.id);
      return old && !equal(old, image);
    });
    if (additions.length) {
      const ids = new Set(additions.map((image) => image.id));
      const blocks = (after.notes?.blocks ?? []).filter((block) => block.imageId && ids.has(block.imageId));
      changes.push({ type: 'addImages', images: additions, blocks });
    }
    for (const image of changedImages) {
      const block = after.notes?.blocks?.find((candidate) => candidate.imageId === image.id);
      changes.push({
        type: 'updateImage', imageId: image.id, caption: image.caption,
        ...(image.needsReview === undefined ? {} : { needsReview: image.needsReview }),
        blockText: block?.text ?? image.caption,
      });
    }

    const imageOnlyDocument = additions.length > 0 || changedImages.length > 0;
    if (!imageOnlyDocument && (!equal(before.notes, after.notes) || !equal(before.suggestedNotes, after.suggestedNotes))) {
      changes.push({
        type: 'setDocument', document: after.notes ?? null,
        suggestedNotes: after.suggestedNotes ?? null,
      });
    }
    if (!equal(before.items, after.items)) changes.push({ type: 'setReviewItems', items: after.items });
  }

  if (!changes.length) return undefined;
  return {
    operationId: operationId(), meetingId: after.id,
    baseRevision: revision(before),
    baseDocumentRevision: documentRevision(before),
    baseSourceRevision: sourceRevision(before),
    changes,
  };
}

/**
 * Merge native speech/generation around edits that have not been acknowledged yet.
 * This function is the editor's live-to-finished boundary and is used directly by
 * the Notes component rather than duplicating the revision formula in tests.
 */
export function reconcileMeetingUpdate(
  authoritative: Meeting,
  durableBeforeLocalEdits: Meeting,
  local: Meeting,
  hasPendingEdits: boolean,
): Meeting {
  if (revision(authoritative) < revision(durableBeforeLocalEdits)) return local;
  if (!hasPendingEdits) return authoritative;

  const next: Meeting = { ...authoritative };
  if (local.title !== durableBeforeLocalEdits.title) next.title = local.title;
  if (!equal(local.notes, durableBeforeLocalEdits.notes)) {
    if (local.notes) next.notes = local.notes; else delete next.notes;
  }
  if (!equal(local.suggestedNotes, durableBeforeLocalEdits.suggestedNotes)) {
    if (local.suggestedNotes) next.suggestedNotes = local.suggestedNotes;
    else delete next.suggestedNotes;
  }
  if (!equal(local.items, durableBeforeLocalEdits.items)) next.items = local.items;
  if (!equal(local.events, durableBeforeLocalEdits.events)) {
    next.events = local.events;
    next.items = local.items;
    if (local.notes) next.notes = local.notes; else delete next.notes;
    if (local.suggestedNotes) next.suggestedNotes = local.suggestedNotes;
    else delete next.suggestedNotes;
    if (local.sourceRevision !== undefined) next.sourceRevision = local.sourceRevision;
    else delete next.sourceRevision;
  }

  // Preserve local image additions/metadata while retaining captures that arrived
  // natively after the editor's last durable snapshot.
  if (!equal(local.images, durableBeforeLocalEdits.images)) {
    const localByID = new Map((local.images ?? []).map((image) => [image.id, image]));
    const merged = (authoritative.images ?? []).map((image) => localByID.get(image.id) ?? image);
    const known = new Set(merged.map((image) => image.id));
    merged.push(...(local.images ?? []).filter((image) => !known.has(image.id)));
    next.images = merged;
  }
  return next;
}

/** Accept only acknowledgments at least as new as the last durable native state. */
export function acceptsAcknowledgment(
  acknowledgment: MeetingMutationAcknowledgment,
  durable: Meeting,
): boolean {
  return acknowledgment.meetingId === durable.id
    && acknowledgment.revision >= revision(durable);
}

/**
 * A generated document that won a race with local typing is retained as a
 * suggestion before the local document is retried against its new base revision.
 */
export function preserveGeneratedConflict(authoritative: Meeting, local: Meeting): Meeting {
  if (equal(authoritative.notes, local.notes)) return local;
  return authoritative.notes && !local.suggestedNotes
    ? { ...local, suggestedNotes: authoritative.notes }
    : local;
}
