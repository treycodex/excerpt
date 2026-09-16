import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { safeImageUrl } from '@excerpt/core';
import type { MeetingImage, NoteBlock, NotesDocument as Document } from '@excerpt/types';

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const fresh = (kind: NoteBlock['kind'] = 'paragraph'): NoteBlock => ({ id: crypto.randomUUID(), kind, text: '', evidence: [], userEdited: true });

export function NotesDocument({ document, images, onChange, onSource, onImages, onMoment, selectedImageId }: {
  document: Document; images: MeetingImage[];
  onChange: (document: Document) => void;
  onSource: (id: string) => void;
  onImages: (files: File[], origin?: MeetingImage['origin']) => void;
  onMoment?: (imageId: string) => void;
  selectedImageId?: string | null;
}) {
  const blocks = document.blocks ?? [];
  const [active, setActive] = useState<string | null>(null);
  const [undo, setUndo] = useState<Document | null>(null);
  const fields = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const commit = (next: NoteBlock[], structural = false) => {
    if (structural) setUndo(document);
    const retained = new Set(next.map((block) => block.id));
    const removed = blocks.filter((block) => !retained.has(block.id));
    const deletedBlocks = [...(document.deletedBlocks ?? []), ...removed];
    onChange({ ...document, blocks: next, ...(deletedBlocks.length ? { deletedBlocks } : {}) });
  };
  const focus = (id: string) => { setActive(id); requestAnimationFrame(() => fields.current[id]?.focus()); };
  const update = (id: string, patch: Partial<NoteBlock>) => commit(blocks.map((b) => b.id === id ? { ...b, ...patch, userEdited: true } : b));
  const add = (kind: NoteBlock['kind']) => {
    const block = fresh(kind);
    const index = blocks.findIndex((b) => b.id === active);
    const next = [...blocks]; next.splice(index < 0 ? next.length : index + 1, 0, block);
    commit(next, true); focus(block.id);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>, block: NoteBlock, index: number) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (block.kind === 'bullet' && !block.text.trim()) { update(block.id, { kind: 'paragraph', indent: 0 }); return; }
      const field = event.currentTarget;
      const after = { ...fresh(block.kind === 'heading' ? 'paragraph' : block.kind), text: block.text.slice(field.selectionEnd), indent: block.indent ?? 0 };
      const next = [...blocks];
      next.splice(index, 1, { ...block, text: block.text.slice(0, field.selectionStart), userEdited: true }, after);
      commit(next, true); focus(after.id);
    }
    if (event.key === 'Backspace' && !block.text && blocks.length > 1) {
      event.preventDefault(); commit(blocks.filter((b) => b.id !== block.id), true);
      const previous = blocks[Math.max(0, index - 1)]; if (previous) focus(previous.id);
    }
    if (event.key === 'Tab' && block.kind === 'bullet') { event.preventDefault(); update(block.id, { indent: Math.max(0, Math.min(2, (block.indent ?? 0) + (event.shiftKey ? -1 : 1))) }); }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  return <div className="free-document" onPaste={(e) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); onImages(files, 'paste'); }
  }} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); onImages(Array.from(e.dataTransfer.files), 'drop');
  }}>
    <div className="writing-toolbar" role="toolbar" aria-label="Document tools">
      <button onClick={() => add('paragraph')}>+ Text</button><button onClick={() => add('heading')}>+ Heading</button><button onClick={() => add('bullet')}>+ Bullet</button>
      <button onClick={() => fileInput.current?.click()}>+ Image</button>
      {undo && <button onClick={() => { onChange(undo); setUndo(null); }}>Undo last structure change</button>}
      <input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => { onImages(Array.from(e.target.files ?? []), 'import'); e.target.value = ''; }} />
    </div>
    {!blocks.length && <button className="empty-document" onClick={() => add('paragraph')}>Start writing, or paste a screenshot…</button>}
    {blocks.map((block, index) => {
      const image = block.imageId ? images.find((i) => i.id === block.imageId) : undefined;
      return <div key={block.id} className={`writing-block ${block.kind} ${active === block.id ? 'active' : ''} ${selectedImageId && block.imageId === selectedImageId ? 'selected-moment' : ''}`} style={{ marginLeft: `${(block.indent ?? 0) * 24}px` }} onFocus={() => setActive(block.id)}>
        {block.kind === 'image' ? <figure>
          {image && safeImageUrl(image.dataUrl) ? <img className="moment-image" role="button" tabIndex={0} onClick={() => onMoment?.(image.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onMoment?.(image.id); } }} src={image.dataUrl} alt={block.text || `Meeting screenshot at ${clock(image.at)}`} /> : <p>Image unavailable.</p>}
          <figcaption><button className="moment-time" onClick={() => image && onMoment?.(image.id)}>{clock(image?.at ?? block.at ?? 0)} · Captured moment</button><input aria-label="Screenshot caption" placeholder="Add a caption…" value={block.text} onChange={(e) => update(block.id, { text: e.target.value })} /></figcaption>
        </figure> : <GrowingText value={block.text} label={block.kind === 'heading' ? 'Section heading' : block.kind === 'bullet' ? 'Bullet point' : 'Paragraph'}
          fieldRef={(field) => { fields.current[block.id] = field; }}
          onChange={(text) => {
            if (text === '- ' || text === '* ') update(block.id, { kind: 'bullet', text: '' });
            else if (text === '## ') update(block.id, { kind: 'heading', text: '' });
            else update(block.id, { text });
          }} onKeyDown={(e) => keyDown(e, block, index)} />}
        <div className="block-tools">
          {block.kind !== 'image' && <select aria-label="Block style" value={block.kind} onChange={(e) => update(block.id, { kind: e.target.value as NoteBlock['kind'] })}><option value="paragraph">Text</option><option value="heading">Heading</option><option value="bullet">Bullet</option></select>}
          {block.evidence.length > 0 && <button onClick={() => onSource(block.evidence[0]!.eventIds[0]!)}>Source ↗</button>}
          <button aria-label="Move block up" disabled={index === 0} onClick={() => { const next = [...blocks]; next.splice(index, 1); next.splice(index - 1, 0, block); commit(next, true); }}>↑</button>
          <button aria-label="Move block down" disabled={index === blocks.length - 1} onClick={() => { const next = [...blocks]; next.splice(index, 1); next.splice(index + 1, 0, block); commit(next, true); }}>↓</button>
          <button aria-label="Delete block" onClick={() => commit(blocks.filter((b) => b.id !== block.id), true)}>Remove</button>
        </div>
        {block.needsReview && <p className="source-review-notice">This passage was corrected. Your wording was kept. <button onClick={() => update(block.id, { needsReview: false })}>Mark reviewed</button></p>}
      </div>;
    })}
    <p className="writing-hint">Enter continues writing · Shift+Enter adds a line · Tab indents a bullet · Paste or drop an image</p>
  </div>;
}

function GrowingText({ value, label, onChange, onKeyDown, fieldRef }: {
  value: string; label: string; onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  fieldRef: (field: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => { if (ref.current) { ref.current.style.height = '0px'; ref.current.style.height = `${ref.current.scrollHeight}px`; } }, [value]);
  return <textarea ref={(field) => { ref.current = field; fieldRef(field); }} aria-label={label} rows={1} placeholder={label === 'Section heading' ? 'Heading' : 'Write something…'} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />;
}
