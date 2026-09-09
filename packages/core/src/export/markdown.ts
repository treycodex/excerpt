import type { Category, Item, Meeting } from '@excerpt/types';

const HEADING: Record<Category, string> = {
  decision: 'Decisions',
  action: 'Action items',
  deadline: 'Deadlines',
  question: 'Open questions',
};

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderItem(item: Item): string {
  const lines: string[] = [];
  const state = item.state === 'decided' ? '' : ` _(${item.state})_`;
  lines.push(`- **${item.title}**${state}`);

  for (const e of item.evidence) {
    // Timing is approximate — measured at event arrival, never from the audio.
    lines.push(`  > ${e.quote}`);
    lines.push(`  > — ${e.speakerLabel}, ~${clock(e.tArrived)}`);
  }
  if (item.assignee === 'you') lines.push('  - Assigned to you');
  if (item.due) lines.push(`  - Due ${item.due}`);
  return lines.join('\n');
}

/**
 * Markdown export. Deliberately plain: this has to paste cleanly into whatever the
 * user already uses, which is the whole point of not building integrations.
 */
export function toMarkdown(meeting: Meeting): string {
  const out: string[] = [];
  const live = meeting.items.filter((i) => !i.dismissed);

  out.push(`# ${meeting.title}`, '');
  out.push(`${new Date(meeting.startedAt).toLocaleString()}`);
  const decided = live.filter((i) => i.state === 'decided').length;
  out.push(`${live.length} items · ${decided} decided · transcription: ${meeting.processing}`, '');

  const order: Category[] = ['decision', 'action', 'deadline', 'question'];
  for (const cat of order) {
    const group = live.filter((i) => i.category === cat);
    if (!group.length) continue;
    out.push(`## ${HEADING[cat]}`, '');
    for (const item of group) out.push(renderItem(item), '');
  }

  const needsReview = live.filter((i) => i.category === 'action' && i.assignee === 'unassigned');
  if (needsReview.length) {
    out.push('## Needs review', '');
    out.push('_Excerpt could not tell who these were addressed to._', '');
    for (const item of needsReview) out.push(`- ${item.title}`);
    out.push('');
  }

  out.push('## Transcript', '');
  for (const e of meeting.events.filter((x) => x.isFinal)) {
    out.push(`**${e.speakerLabel}** ~${clock(e.tArrived)} — ${e.text}`, '');
  }

  out.push('---', '', '_Notes by Excerpt. Timings are approximate; every item links to the',
           'transcript passage it came from, not to audio._');
  return out.join('\n');
}
