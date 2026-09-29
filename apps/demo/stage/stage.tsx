/**
 * The stage for the after-the-call footage: Excerpt's own editor (apps/editor), the
 * same bundle the Mac app loads, running against the meeting recorded for the demo.
 * The native host is the editor's test double, with one addition: "Write notes"
 * completes, using the product's own extractive notes builder, the document the Mac
 * app saves when Apple Intelligence is unavailable.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Meeting } from '@excerpt/types';
import { buildNotesDocument } from '@excerpt/core';
import { createFakeNativeHost, installFakeNativeHost } from '../../editor/src/test/fakeNativeHost';
import '../../editor/src/fonts.css';
import '@excerpt/ui/tokens.css';
import '@excerpt/ui/strip.css';
import '../../editor/src/app.css';
import { App } from '../../editor/src/App';
import recorded from '../footage/stage-meeting.json';

const meeting = recorded as unknown as Meeting;
const host = createFakeNativeHost({ meetings: [meeting] });
const queue = host.retryAutomaticNotes.bind(host);
host.retryAutomaticNotes = async (id) => {
  const queued = await queue(id);
  setTimeout(() => {
    const current = host.meetings.get(id)!;
    const written: Meeting = {
      ...current, notes: buildNotesDocument(current),
      generationStatus: { state: 'completed', generationId: `stage-${id}`, sourceRevision: current.sourceRevision ?? 0 },
    };
    host.meetings.set(id, written);
    const event = new Event('excerpt:meeting');
    Object.assign(event, { detail: JSON.parse(JSON.stringify(written)) });
    window.dispatchEvent(event);
  }, 2200);
  return queued;
};
installFakeNativeHost(host);
document.documentElement.dataset.host = 'mac';
(window as unknown as { __stage: unknown }).__stage = { host, id: meeting.id };

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
