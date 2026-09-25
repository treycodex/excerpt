import type { Meeting, NoteBlock, NotesDocument } from '@excerpt/types';
import { editableDocument, meetingImageContext, meetingImageTime } from './editor';
import { mergeGeneratedNotes } from './generation';

const sourceIds = (block: NoteBlock) => new Set(block.evidence.flatMap((source) => source.eventIds));

/**
 * Place only automatic captures. A block moved by the reader, including a legacy
 * block without placement metadata, keeps its exact document position.
 */
export function composeVisualNotes(meeting: Meeting, wording: NotesDocument): NotesDocument {
  const current = editableDocument(meeting);
  const textOnly = editableDocument({ ...meeting, notes: wording.blocks
    ? { ...wording, blocks: wording.blocks.filter((block) => block.kind !== 'image') }
    : wording, images: [] });
  const merged = mergeGeneratedNotes(current, textOnly);
  const blocks = (merged.blocks ?? []).filter((block) => block.placement !== 'automatic' || block.kind !== 'image');
  const retained = new Set(blocks.flatMap((block) => block.imageId ? [block.imageId] : []));
  const deleted = new Set((current.deletedBlocks ?? []).flatMap((block) => block.imageId ? [block.imageId] : []));
  let lastAutomatic = -1;

  for (const image of [...(meeting.images ?? [])].sort((a, b) =>
    Number(a.timeKnown === false) - Number(b.timeKnown === false)
      || meetingImageTime(a) - meetingImageTime(b) || a.id.localeCompare(b.id))) {
    if (retained.has(image.id) || deleted.has(image.id)) continue;
    const old = current.blocks?.find((block) => block.imageId === image.id);
    const context = image.timeKnown === false ? { eventIds: [], startAt: 0, endAt: -1 }
      : image.context ?? meetingImageContext(meeting, meetingImageTime(image));
    const ids = new Set(context.eventIds);
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      if (block.kind === 'image' || block.kind === 'heading' || !block.evidence.length) continue;
      const shared = [...sourceIds(block)].filter((id) => ids.has(id)).length;
      const inWindow = block.at !== undefined && block.at >= context.startAt && block.at <= context.endAt;
      if (!shared && !inWindow) continue;
      // A shared source beats a nearby timestamp; distance decides ties.
      const score = shared * 1_000_000 - Math.abs((block.at ?? meetingImageTime(image)) - meetingImageTime(image));
      if (score > bestScore) { best = i; bestScore = score; }
    }
    let insertion = image.timeKnown === false ? blocks.length
      : best >= 0 ? best + 1 : blocks.findIndex((block) => block.at !== undefined && block.at > meetingImageTime(image));
    if (insertion < 0) insertion = blocks.length;
    insertion = Math.max(insertion, lastAutomatic + 1);
    const block: NoteBlock = old
      ? { ...old, text: old.userEdited ? old.text : image.caption,
          ...(image.timeKnown === false ? {} : { at: meetingImageTime(image) }), placement: 'automatic' }
      : { id: `image-${image.id}`, kind: 'image', text: image.caption, imageId: image.id,
          ...(image.timeKnown === false ? {} : { at: meetingImageTime(image) }), evidence: [], placement: 'automatic' };
    blocks.splice(insertion, 0, block);
    retained.add(image.id);
    lastAutomatic = insertion;
  }

  return { ...merged, blocks };
}
