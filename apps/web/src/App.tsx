import { useCallback, useState } from 'react';
import { extractItems, saveMeeting } from '@excerpt/core';
import type { Meeting, TranscriptEvent } from '@excerpt/types';
import { Landing } from './views/Landing';
import { Session } from './views/Session';
import { Notes } from './views/Notes';

type Phase =
  | { at: 'landing' }
  | { at: 'session' }
  | { at: 'notes'; meeting: Meeting };

export function App() {
  const [phase, setPhase] = useState<Phase>({ at: 'landing' });

  const onEnd = useCallback(async (events: TranscriptEvent[]) => {
    const meeting: Meeting = {
      id: `m-${Date.now()}`,
      title: 'Northside — campaign review',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      processing: 'demo',
      events,
      items: extractItems(events, new Date()),
    };
    await saveMeeting(meeting);
    setPhase({ at: 'notes', meeting });
    window.scrollTo({ top: 0 });
  }, []);

  if (phase.at === 'landing') return <Landing onStart={() => setPhase({ at: 'session' })} />;
  if (phase.at === 'session') return <Session onEnd={onEnd} />;
  return <Notes meeting={phase.meeting} onReplay={() => setPhase({ at: 'session' })} />;
}
