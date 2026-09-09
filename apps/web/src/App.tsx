import { useEffect, useMemo, useState } from 'react';
import { DemoTranscriptAdapter, splitIntoSubtitleLines } from '@excerpt/core';
import type { TranscriptEvent } from '@excerpt/types';
import { DEMO_SCRIPT } from './demo/script';

/** How long a caption lingers after its last update, in ms. */
const LINGER = 2600;

interface Spoken { text: string; at: number; label: string }

export function App() {
  const [spoken, setSpoken] = useState<Record<string, Spoken>>({});
  const [tick, setTick] = useState(0);
  const adapter = useMemo(
    () => new DemoTranscriptAdapter(DEMO_SCRIPT, 'demo-session', 1),
    [],
  );
  useEffect(() => {
    const off = adapter.onEvent((e: TranscriptEvent) => {
      setSpoken((prev) => ({
        ...prev,
        [e.role]: { text: e.text, at: performance.now(), label: e.speakerLabel },
      }));
    });
    // No mount guard: StrictMode intentionally mounts twice, and the cleanup below
    // clears every scheduled timer. Guarding the start would leave the second mount
    // with an adapter that never replays.
    void adapter.start();
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => { off(); clearInterval(id); void adapter.stop(); };
  }, [adapter]);

  void tick; // drives expiry of lingering captions

  const now = performance.now();
  const fresh = Object.values(spoken)
    .filter((s) => now - s.at < LINGER)
    .sort((a, b) => a.at - b.at);

  return (
    <div className="stage">
      <div className="hud">
        Excerpt · <b>demo</b> · captions from the real adapter
      </div>
      <Caption fresh={fresh} />
    </div>
  );
}

function Caption({ fresh }: { fresh: Spoken[] }) {
  const key = fresh.map((f) => f.text).join('|');
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [key]);

  if (!fresh.length) return null;

  // Two speakers inside one window use the film dash convention.
  const overlapping = fresh.length > 1;

  return (
    <div className="caption">
      <div className={`fade${shown ? ' in' : ''}`}>
        {!overlapping && fresh[0] && <div className="who">{fresh[0].label}</div>}
        {fresh.flatMap((s, i) => {
          const lines = splitIntoSubtitleLines(s.text, { maxChars: overlapping ? 40 : 42 });
          const text = overlapping ? `– ${lines.join(' ')}` : null;
          return text
            ? [<div className="line" key={i}>{text}</div>]
            : lines.map((l, j) => <div className="line" key={`${i}-${j}`}>{l}</div>);
        })}
      </div>
    </div>
  );
}
