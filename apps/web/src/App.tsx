import { useCallback, useState } from 'react';
import { extractItems, saveMeeting } from '@excerpt/core';
import type { Meeting, TranscriptEvent } from '@excerpt/types';
import { Session } from './views/Session';
import { Notes } from './views/Notes';

export function App() {
  const [meeting, setMeeting] = useState<Meeting | null>(null);

  const onEnd = useCallback(async (events: TranscriptEvent[]) => {
    const m: Meeting = {
      id: `m-${Date.now()}`,
      title: 'Northside — campaign review',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      processing: 'demo',
      events,
      items: extractItems(events),
    };
    await saveMeeting(m);      // persisted locally before it is shown
    setMeeting(m);
  }, []);

  return meeting ? <Notes meeting={meeting} /> : <Session onEnd={onEnd} />;
}
