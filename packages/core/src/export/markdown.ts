import type { Category, Item, Meeting } from '@excerpt/types';
import { noteTitle } from '../notes/summary';
import { editableDocument, meetingImageTime, safeImageUrl } from '../notes/editor';
import { documentSummary } from '../notes/overview';

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
  const edited = item.userEdited ? ' _(edited)_' : '';
  lines.push(`- ${item.category === 'action' ? `[${item.completed ? 'x' : ' '}] ` : ''}**${noteTitle(item)}**${state}${edited}`);

  for (const e of item.evidence) {
    // Timing is approximate — measured at event arrival, never from the audio.
    lines.push(`  > ${e.quote}`);
    lines.push(`  > — ${e.speakerLabel}, ${e.tStart !== undefined ? clock(e.tStart * 1000) : `~${clock(e.tArrived)}`}`);
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
  const decided = live.filter((i) => i.category === 'decision' && i.state === 'decided').length;
  out.push(`${live.length} items · ${decided} decided · transcription: ${meeting.processing}`, '');

  const summary = meeting.notes ? documentSummary(editableDocument(meeting)) : [];
  if (summary.length) {
    out.push('## Summary', '');
    for (const line of summary) out.push(`- ${line.text}`);
    out.push('');
  }

  if (meeting.notes?.blocks) {
    for (const block of meeting.notes.blocks) {
      if (block.kind === 'image') {
        const image = meeting.images?.find((i) => i.id === block.imageId);
        if (image && safeImageUrl(image.dataUrl)) out.push(`![${block.text.replace(/[\[\]\n]/g, ' ') || 'Meeting screenshot'}](${image.dataUrl})`, `_${image.timeKnown === false ? 'Time unknown' : clock(meetingImageTime(image))} · Screenshot_`, '');
      } else out.push(`${block.kind === 'heading' ? '## ' : block.kind === 'bullet' ? `${'  '.repeat(block.indent ?? 0)}- ` : ''}${block.text}`, '');
    }
  } else if (meeting.notes) {
    const sections = [{ title: 'Key points', bullets: meeting.notes.keyPoints }, ...meeting.notes.topics];
    for (const section of sections) {
      if (!section.bullets.length) continue;
      out.push(`## ${section.title}`, '');
      for (const bullet of section.bullets) out.push(`- ${bullet.text}${bullet.userEdited ? ' _(edited)_' : ''}`);
      out.push('');
    }
  }

  const fallback: Category[] = ['decision', 'action', 'deadline', 'question'];
  const order = Array.from(new Set(live.map((i) => i.category))) as Category[];
  for (const category of fallback) if (!order.includes(category)) order.push(category);
  const displayOrder = meeting.notes ? [...order.filter((c) => c !== 'action'), 'action' as const] : order;
  for (const cat of displayOrder) {
    const group = live.filter((i) => i.category === cat);
    if (!group.length) continue;
    out.push(`## ${HEADING[cat]}`, '');
    for (const item of group) out.push(renderItem(item), '');
  }

  const needsReview = live.filter((i) => i.category === 'action' && i.assignee === 'unassigned');
  if (needsReview.length) {
    out.push('## Needs review', '');
    out.push('_Excerpt could not tell who these were addressed to._', '');
    for (const item of needsReview) out.push(`- ${noteTitle(item)}`);
    out.push('');
  }

  out.push('## Transcript', '');
  for (const e of meeting.events.filter((x) => x.isFinal)) {
    if (e.originalText !== undefined) {
      out.push(`_Original: ${e.originalText}_`);
      for (const correction of e.corrections ?? []) out.push(`_Corrected ${correction.correctedAt}: ${correction.text}_`);
      out.push('');
    }
    out.push(`**${e.speakerLabel}** ${e.tStart !== undefined ? clock(e.tStart * 1000) : `~${clock(e.tArrived)}`} — ${e.text}`, '');
  }

  out.push('---', '', '_Notes by Excerpt. Times marked ~ are approximate. The original transcript is preserved._');
  return out.join('\n');
}

/** Portable image export: a single offline HTML file, with escaped text and embedded raster images. */
export function toHTML(meeting: Meeting): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const document = editableDocument(meeting);
  const body = document.blocks!.map((block) => {
    if (block.kind === 'image') {
      const image = meeting.images?.find((i) => i.id === block.imageId);
      return image && safeImageUrl(image.dataUrl) ? `<figure><img src="${image.dataUrl}" alt="${escape(block.text || 'Meeting screenshot')}"><figcaption>${image.timeKnown === false ? 'Time unknown' : clock(meetingImageTime(image))} · ${escape(block.text || 'Screenshot')}</figcaption></figure>` : '';
    }
    const text = escape(block.text).replace(/\n/g, '<br>');
    if (block.kind === 'heading') return `<h2>${text}</h2>`;
    if (block.kind === 'bullet') return `<ul style="margin-left:${Math.min(2, Math.max(0, block.indent ?? 0)) * 24}px"><li>${text}</li></ul>`;
    return `<p>${text}</p>`;
  }).join('\n');
  const summary = documentSummary(document).map((line) => `<li>${escape(line.text)}</li>`).join('');
  const review = meeting.items.filter((i) => !i.dismissed).map((i) => `<li>${escape(noteTitle(i))}${i.due ? ` · Due ${escape(i.due)}` : ''}${i.assignee === 'you' ? ' · Assigned to you' : ''}${i.completed ? ' · Done' : ''}${i.confirmed ? ' · Confirmed by you' : ''}</li>`).join('');
  const transcript = meeting.events.filter((event) => event.isFinal).map((event) => {
    const history = event.originalText === undefined ? '' : `<small>Original: ${escape(event.originalText)}${(event.corrections ?? []).map((correction) => `<br>Corrected ${escape(correction.correctedAt)}: ${escape(correction.text)}`).join('')}</small>`;
    return `<p><b>${escape(event.speakerLabel)}</b> ${event.tStart !== undefined ? clock(event.tStart * 1000) : `~${clock(event.tArrived)}`} — ${escape(event.text)}${history}</p>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escape(meeting.title)}</title><style>body{max-width:760px;margin:60px auto;padding:0 24px;font:17px/1.65 system-ui;color:#242424}h1{font-size:36px;line-height:1.2}h2{margin-top:32px;font-size:23px}p,ul{margin:8px 0}figure{margin:28px 0}img{max-width:100%;height:auto}figcaption,small{display:block;font-size:13px;color:#666}details{margin-top:48px}li{white-space:normal}</style><h1>${escape(meeting.title)}</h1><p>${escape(meeting.startedAt)}</p>${summary ? `<h2>Summary</h2><ul>${summary}</ul>` : ''}${body}${review ? `<details><summary>Decisions and commitments</summary><ul>${review}</ul></details>` : ''}${transcript ? `<details><summary>Transcript and correction history</summary>${transcript}</details>` : ''}</html>`;
}
