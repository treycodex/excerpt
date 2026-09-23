import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { boundTombstones, meetingImageTime, safeImageUrl } from '@excerpt/core';
import type { MeetingImage, NoteBlock, NotesDocument as Document } from '@excerpt/types';

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const fresh = (kind: NoteBlock['kind'] = 'paragraph'): NoteBlock => ({ id: crypto.randomUUID(), kind, text: '', evidence: [], userEdited: true });
const blockLabel: Record<NoteBlock['kind'], string> = {
  paragraph: 'Text',
  heading: 'Heading',
  bullet: 'List',
  image: 'Image',
};

function mergedEvidence(first: NoteBlock['evidence'], second: NoteBlock['evidence']): NoteBlock['evidence'] {
  const seen = new Set<string>();
  return [...first, ...second].filter((evidence) => {
    const key = `${evidence.eventIds.join('\u0000')}\u0001${evidence.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function NotesDocument({ document, images, onChange, onSource, onImages, onMoment, selectedImageId }: {
  document: Document; images: MeetingImage[];
  onChange: (document: Document) => void;
  onSource: (block: NoteBlock) => void;
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
    const deletedBlocks = boundTombstones([...(document.deletedBlocks ?? []), ...removed]);
    onChange({ ...document, blocks: next, ...(deletedBlocks.length ? { deletedBlocks } : {}) });
  };
  const focus = (id: string, position?: number) => {
    setActive(id);
    requestAnimationFrame(() => {
      const field = fields.current[id];
      field?.focus();
      if (field && position !== undefined) field.setSelectionRange(position, position);
    });
  };
  const update = (id: string, patch: Partial<NoteBlock>) => commit(blocks.map((b) => b.id === id ? { ...b, ...patch, userEdited: true } : b));
  const add = (kind: NoteBlock['kind']) => {
    const block = fresh(kind);
    const index = blocks.findIndex((b) => b.id === active);
    const next = [...blocks]; next.splice(index < 0 ? next.length : index + 1, 0, block);
    commit(next, true); focus(block.id);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>, block: NoteBlock, index: number) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey && block.text.startsWith('/')) {
      const command = block.text.toLowerCase().trim();
      const kind = command === '/heading' || command === '/h' ? 'heading'
        : command === '/bullet' || command === '/list' ? 'bullet'
          : command === '/text' || command === '/paragraph' ? 'paragraph' : undefined;
      if (kind) {
        event.preventDefault();
        update(block.id, { kind, text: '', indent: kind === 'bullet' ? block.indent ?? 0 : 0 });
        focus(block.id);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (block.kind === 'bullet' && !block.text.trim()) { update(block.id, { kind: 'paragraph', indent: 0 }); return; }
      const field = event.currentTarget;
      const after = { ...fresh(block.kind === 'heading' ? 'paragraph' : block.kind), text: block.text.slice(field.selectionEnd), indent: block.indent ?? 0 };
      const next = [...blocks];
      next.splice(index, 1, { ...block, text: block.text.slice(0, field.selectionStart), userEdited: true }, after);
      commit(next, true); focus(after.id);
    }
    if (event.key === 'Backspace' && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      if (block.kind !== 'paragraph') {
        event.preventDefault(); update(block.id, { kind: 'paragraph', indent: 0 }); return;
      }
      if (!block.text && blocks.length > 1) {
        event.preventDefault(); commit(blocks.filter((b) => b.id !== block.id), true);
        const previous = blocks[Math.max(0, index - 1)]; if (previous) focus(previous.id, previous.text.length);
        return;
      }
      const previous = blocks[index - 1];
      if (previous && previous.kind !== 'image') {
        event.preventDefault();
        const joinAt = previous.text.length;
        const merged = { ...previous, text: previous.text + block.text, evidence: mergedEvidence(previous.evidence, block.evidence), userEdited: true };
        const next = [...blocks]; next.splice(index - 1, 2, merged);
        commit(next, true); focus(previous.id, joinAt);
      }
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
    {!blocks.length && <button className="empty-document" onClick={() => add('paragraph')}>Start writing, or paste a screenshot…</button>}
    {blocks.map((block, index) => {
      const image = block.imageId ? images.find((i) => i.id === block.imageId) : undefined;
      return <div key={block.id} className={`writing-block ${block.kind} ${active === block.id ? 'active' : ''} ${selectedImageId && block.imageId === selectedImageId ? 'selected-moment' : ''}`} style={{ marginLeft: `${(block.indent ?? 0) * 24}px` }} onFocus={() => setActive(block.id)}>
        <div className="block-gutter">
          <details className="block-menu">
            <summary aria-label={`${blockLabel[block.kind]} block options`} title="Block options"><span aria-hidden="true">⠿</span></summary>
            <div className="block-popover">
              {block.kind !== 'image' && <div className="block-kind-picker" role="group" aria-label="Block style">
                {(['paragraph', 'heading', 'bullet'] as const).map((kind) => <button key={kind} aria-pressed={block.kind === kind} onClick={() => update(block.id, { kind, indent: kind === 'bullet' ? block.indent ?? 0 : 0 })}>{blockLabel[kind]}</button>)}
              </div>}
              <button disabled={index === 0} onClick={() => { const next = [...blocks]; next.splice(index, 1); next.splice(index - 1, 0, block.kind === 'image' ? { ...block, placement: 'manual' } : block); commit(next, true); }}>Move up</button>
              <button disabled={index === blocks.length - 1} onClick={() => { const next = [...blocks]; next.splice(index, 1); next.splice(index + 1, 0, block.kind === 'image' ? { ...block, placement: 'manual' } : block); commit(next, true); }}>Move down</button>
              <button className="block-delete" onClick={() => commit(blocks.filter((b) => b.id !== block.id), true)}>Delete</button>
            </div>
          </details>
        </div>
        <div className="block-body">
          {block.kind === 'image' ? <figure>
            {image && safeImageUrl(image.dataUrl) ? <img className="moment-image" role="button" tabIndex={0} onClick={() => onMoment?.(image.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onMoment?.(image.id); } }} src={image.dataUrl} alt={block.text || `Meeting screenshot at ${clock(image.at)}`} /> : <p>Image unavailable.</p>}
            <figcaption><button className="moment-time" onClick={() => image && onMoment?.(image.id)}>{image?.timeKnown === false ? 'Time unknown' : clock(image ? meetingImageTime(image) : block.at ?? 0)} · Captured moment</button><input aria-label="Screenshot caption" placeholder="Add a caption…" value={block.text} onChange={(e) => update(block.id, { text: e.target.value })} /></figcaption>
          </figure> : <GrowingText value={block.text} label={block.kind === 'heading' ? 'Section heading' : block.kind === 'bullet' ? 'Bullet point' : 'Paragraph'}
            fieldRef={(field) => { fields.current[block.id] = field; }}
            onChange={(text) => {
              if (text === '- ' || text === '* ') update(block.id, { kind: 'bullet', text: '' });
              else if (text === '# ' || text === '## ') update(block.id, { kind: 'heading', text: '' });
              else update(block.id, { text });
            }} onKeyDown={(e) => keyDown(e, block, index)} />}
          {active === block.id && block.kind !== 'image' && block.text.startsWith('/') && (
            <div className="slash-menu" aria-label="Writing blocks">
              <span>Turn into</span>
              <button onClick={() => { update(block.id, { kind: 'paragraph', text: '', indent: 0 }); focus(block.id); }}>Text</button>
              <button onClick={() => { update(block.id, { kind: 'heading', text: '', indent: 0 }); focus(block.id); }}>Heading</button>
              <button onClick={() => { update(block.id, { kind: 'bullet', text: '' }); focus(block.id); }}>List</button>
            </div>
          )}
          <div className="block-meta">
            {block.kind !== 'image' && block.evidence.length > 0 && (
              <button className="block-citation" onClick={() => onSource(block)}
                aria-label={`Show the ${block.evidence.length} source ${block.evidence.length === 1 ? 'passage' : 'passages'} for this note`}>
                {block.evidence.length === 1 ? 'Source' : `${block.evidence.length} sources`} <span aria-hidden="true">↗</span>
              </button>
            )}
            {block.needsReview && <p className="source-review-notice">Source changed; your wording was kept. <button onClick={() => update(block.id, { needsReview: false })}>Mark reviewed</button></p>}
          </div>
        </div>
      </div>;
    })}
    <div className="writing-toolbar" role="toolbar" aria-label="Add to document">
      <span>Add</span>
      <button onClick={() => add('paragraph')}><span aria-hidden="true">T</span> Text</button>
      <button onClick={() => add('heading')}><span aria-hidden="true">H</span> Heading</button>
      <button onClick={() => add('bullet')}><span aria-hidden="true">•</span> List</button>
      <button onClick={() => fileInput.current?.click()}><span aria-hidden="true">▧</span> Image</button>
      {undo && <button className="writing-undo" onClick={() => { onChange(undo); setUndo(null); }}>Undo</button>}
      <input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => { onImages(Array.from(e.target.files ?? []), 'import'); e.target.value = ''; }} />
    </div>
    <p className="writing-hint">Enter for a new block · Shift+Enter for a line break · Type / for blocks · Paste or drop an image</p>
  </div>;
}

function GrowingText({ value, label, onChange, onKeyDown, fieldRef }: {
  value: string; label: string; onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  fieldRef: (field: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => { if (ref.current) { ref.current.style.height = '0px'; ref.current.style.height = `${ref.current.scrollHeight}px`; } }, [value]);
  return <textarea ref={(field) => { ref.current = field; fieldRef(field); }} aria-label={label} rows={1} placeholder={label === 'Section heading' ? 'Heading' : label === 'Bullet point' ? 'List item' : "Write something, or type '/' for blocks"} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />;
}
