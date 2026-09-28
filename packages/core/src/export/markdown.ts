import type { Meeting } from '@excerpt/types';
import { editableDocument, hasSmartNotes, meetingImageTime, safeImageUrl } from '../notes/editor';
import { transcriptTimeline } from '../transcript/timeline';

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
const stamp = (event: Meeting['events'][number]) => event.tStart !== undefined
  ? clock(event.tStart * 1000) : `~${clock(event.tArrived)}`;
const speaker = (event: Meeting['events'][number]) => event.role === 'you' ? 'You'
  : event.speakerLabel === 'SPEAKER' ? 'Meeting audio' : event.speakerLabel;
const writtenBlocks = (meeting: Meeting) => hasSmartNotes(meeting)
  ? (editableDocument(meeting).blocks ?? []).filter((block) => block.kind !== 'image' && block.text.trim()) : [];
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const passageId = (id: string) => `passage-${encodeURIComponent(id)}`;

/** Both formats follow the app: transcript and captures first, optional notes after. */
export function toMarkdown(meeting: Meeting): string {
  const out: string[] = [`# ${meeting.title}`, '', new Date(meeting.startedAt).toLocaleString(), '', '## Transcript', ''];
  for (const entry of transcriptTimeline(meeting.events, meeting.images)) {
    if (entry.kind === 'image') {
      const image = entry.image;
      const when = image.timeKnown === false ? 'Time unknown' : clock(meetingImageTime(image));
      if (safeImageUrl(image.dataUrl)) out.push(`![${image.caption.replace(/[\[\]\n]/g, ' ') || 'Meeting screenshot'}](${image.dataUrl})`);
      out.push(`_${when} · Screenshot${image.caption ? ` · ${image.caption}` : ''}_`, '');
      continue;
    }
    out.push(`### ${speaker(entry.turn.events[0]!)} · ${stamp(entry.turn.events[0]!)}`, '');
    for (const event of entry.turn.events) {
      out.push(event.text, '');
      if (event.originalText !== undefined) {
        out.push(`_Original: ${event.originalText}_`);
        for (const correction of event.corrections ?? []) out.push(`_Corrected ${correction.correctedAt}: ${correction.text}_`);
        out.push('');
      }
    }
  }
  const notes = writtenBlocks(meeting);
  if (notes.length) {
    // Attribute quotes with the transcript's own names, not the raw recognizer labels.
    const byId = new Map(meeting.events.map((event) => [event.id, event]));
    const quoted = (source: Meeting['items'][number]['evidence'][number]) => {
      const event = source.eventIds.map((id) => byId.get(id)).find(Boolean);
      return event ? speaker(event) : source.speakerLabel === 'YOU' ? 'You' : source.speakerLabel === 'SPEAKER' ? 'Meeting audio' : source.speakerLabel;
    };
    out.push('## Notes', '');
    for (const block of notes) {
      const prefix = block.kind === 'heading' ? '### ' : block.kind === 'bullet' ? `${'  '.repeat(block.indent ?? 0)}- ` : '';
      out.push(`${prefix}${block.text}`, '');
      for (const source of block.evidence) out.push(`> ${source.quote.replace(/\n/g, '\n> ')}\n> — ${quoted(source)}, ${source.tStart !== undefined ? clock(source.tStart * 1000) : `~${clock(source.tArrived)}`}`, '');
    }
  }
  out.push('---', '', '_Times marked ~ are approximate. Original wording and correction history are preserved._');
  return out.join('\n');
}

/** One offline document: image bytes are embedded once and sources link to passages. */
export function toHTML(meeting: Meeting): string {
  const eventIds = new Set(meeting.events.filter((event) => event.isFinal).map((event) => event.id));
  const notes = writtenBlocks(meeting).map((block) => {
    const value = escape(block.text).replace(/\n/g, '<br>');
    const sources = [...new Set(block.evidence.flatMap((source) => source.eventIds))]
      .filter((id) => eventIds.has(id)).map((id, index) => `<a href="#${passageId(id)}">Source ${index + 1}</a>`).join(' · ');
    const text = block.kind === 'heading' ? `<h3>${value}</h3>` : block.kind === 'bullet'
      ? `<p class="bullet" style="margin-left:${Math.max(0, Math.min(2, block.indent ?? 0)) * 24}px">${value}</p>` : `<p>${value}</p>`;
    return `${text}${sources ? `<small>${sources}</small>` : ''}`;
  }).join('\n');
  const transcript = transcriptTimeline(meeting.events, meeting.images).map((entry) => {
    if (entry.kind === 'image') {
      const image = entry.image;
      const when = image.timeKnown === false ? 'Time unknown' : clock(meetingImageTime(image));
      const picture = safeImageUrl(image.dataUrl) ? `<img src="${image.dataUrl}" alt="${escape(image.caption || 'Meeting screenshot')}">` : '<p>Image unavailable</p>';
      return `<figure>${picture}<figcaption>${escape(when)} · Screenshot${image.caption ? ` · ${escape(image.caption)}` : ''}</figcaption></figure>`;
    }
    const lines = entry.turn.events.map((event) => {
      const history = event.originalText === undefined ? '' : `<details><summary>Correction history</summary><p>Original: ${escape(event.originalText)}</p>${(event.corrections ?? []).map((correction) => `<p>Corrected ${escape(correction.correctedAt)}: ${escape(correction.text)}</p>`).join('')}</details>`;
      return `<div id="${passageId(event.id)}"><p>${escape(event.text).replace(/\n/g, '<br>')}</p>${history}</div>`;
    }).join('');
    return `<section class="turn"><h3>${escape(speaker(entry.turn.events[0]!))} <span>${stamp(entry.turn.events[0]!)}</span></h3>${lines}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escape(meeting.title)}</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;font:17px/1.7 system-ui;color:#242424;background:#faf9f2}h1{font-size:36px;line-height:1.2}h2{margin:42px 0 20px;font-size:22px}h3{font-size:16px;margin:26px 0 6px}.turn h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#57574f}.turn h3 span{font-weight:400;margin-left:12px}p{margin:7px 0}.bullet{padding-left:18px}.bullet:before{content:'• ';margin-left:-18px}figure{margin:26px 0}img{max-width:100%;height:auto}figcaption,small,details,footer{display:block;font-size:13px;color:#57574f}a{color:inherit}nav{display:flex;gap:18px}footer{margin-top:40px;border-top:1px solid #ccc;padding-top:12px}:target{background:#eee8cc}</style></head><body><h1>${escape(meeting.title)}</h1><p>${escape(new Date(meeting.startedAt).toLocaleString())}</p>${notes ? '<nav aria-label="Meeting sections"><a href="#transcript">Transcript</a><a href="#notes">Notes</a></nav>' : ''}<h2 id="transcript">Transcript</h2>${transcript || '<p>No transcript or screenshots were captured.</p>'}${notes ? `<h2 id="notes">Notes</h2>${notes}` : ''}<footer>Times marked ~ are approximate. Original wording and correction history are preserved.</footer></body></html>`;
}
