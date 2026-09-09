import { useEffect, useMemo, useState } from 'react';
import { DemoTranscriptAdapter, splitIntoSubtitleLines } from '@excerpt/core';
import type { TranscriptEvent } from '@excerpt/types';
import { DEMO_SCRIPT } from '../demo/script';

const LINGER = 2600;
interface Spoken { text: string; at: number; label: string }

export function Session({ onEnd }: { onEnd: (events: TranscriptEvent[]) => void }) {
  const [spoken, setSpoken] = useState<Record<string, Spoken>>({});
  const [, setTick] = useState(0);
  const adapter = useMemo(() => new DemoTranscriptAdapter(DEMO_SCRIPT, 'demo-session', 1), []);

  useEffect(() => {
    const collected: TranscriptEvent[] = [];
    const off = adapter.onEvent((e) => {
      if (e.isFinal) collected.push(e);
      setSpoken((prev) => ({
        ...prev,
        [e.role]: { text: e.text, at: performance.now(), label: e.speakerLabel },
      }));
    });
    void adapter.start();
    const tick = setInterval(() => setTick((t) => t + 1), 250);
    const end = setTimeout(() => onEnd(collected), adapter.duration + LINGER);
    return () => { off(); clearInterval(tick); clearTimeout(end); void adapter.stop(); };
  }, [adapter, onEnd]);

  const now = performance.now();
  const fresh = Object.values(spoken).filter((s) => now - s.at < LINGER).sort((a, b) => a.at - b.at);

  return (
    <div className="stage">
      <div className="hud">Excerpt · <b>in session</b></div>
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
  const overlapping = fresh.length > 1;

  return (
    <div className="caption">
      <div className={`fade${shown ? ' in' : ''}`}>
        {!overlapping && fresh[0] && <div className="who">{fresh[0].label}</div>}
        {fresh.flatMap((s, i) => {
          const lines = splitIntoSubtitleLines(s.text, { maxChars: overlapping ? 40 : 42 });
          return overlapping
            ? [<div className="line" key={i}>– {lines.join(' ')}</div>]
            : lines.map((l, j) => <div className="line" key={`${i}-${j}`}>{l}</div>);
        })}
      </div>
    </div>
  );
}
