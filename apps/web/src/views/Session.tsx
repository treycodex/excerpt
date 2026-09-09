import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DemoTranscriptAdapter } from '@excerpt/core';
import { Strip } from '@excerpt/ui';
import type { TranscriptEvent } from '@excerpt/types';
import { DEMO_SCRIPT } from '../demo/script';
import { CallFrame } from './CallFrame';
import type { Spoken } from './CallFrame';

const LINGER = 3200;

export function Session({ onEnd }: { onEnd: (events: TranscriptEvent[]) => void }) {
  const adapter = useMemo(() => new DemoTranscriptAdapter(DEMO_SCRIPT, 'demo-session', 1), []);
  const duration = adapter.duration + 2000;

  const [spoken, setSpoken] = useState<Record<string, Spoken>>({});
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const collected = useRef<TranscriptEvent[]>([]);
  const base = useRef({ at: performance.now(), offset: 0 });

  const finish = useCallback(() => {
    void adapter.stop();
    onEnd(adapter.finalsUpTo(adapter.duration));
  }, [adapter, onEnd]);

  useEffect(() => {
    const off = adapter.onEvent((e) => {
      if (e.isFinal) collected.current.push(e);
      setSpoken((prev) => ({
        ...prev,
        [e.role]: { text: e.text, at: performance.now(), label: e.speakerLabel },
      }));
    });
    void adapter.start(0);
    base.current = { at: performance.now(), offset: 0 };
    return () => { off(); void adapter.stop(); };
  }, [adapter]);

  // A single clock drives the strip, the call timer and the end of the demo.
  //
  // Deliberately setInterval, not requestAnimationFrame: rAF stops dead in a hidden
  // tab while the caption timers keep firing, so a judge who switches away would come
  // back to captions and a strip that disagree. The value is computed from
  // performance.now() each tick, so throttling costs resolution, never accuracy.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const now = base.current.offset + (performance.now() - base.current.at);
      setElapsed(now);
      if (now >= duration) finish();
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [playing, duration, finish]);

  const seek = (ms: number) => {
    if (!Number.isFinite(ms)) return;   // never let a bad measurement corrupt the clock
    const target = Math.max(0, Math.min(duration, ms));
    base.current = { at: performance.now(), offset: target };
    setElapsed(target);
    setSpoken({});
    collected.current = adapter.finalsUpTo(target);
    void adapter.seek(target);
    setPlaying(true);
  };

  const toggle = () => {
    if (playing) {
      base.current = { at: performance.now(), offset: elapsed };
      void adapter.stop();
      setPlaying(false);
    } else {
      seek(elapsed);
    }
  };

  const now = performance.now();
  const fresh = Object.values(spoken)
    .filter((s) => now - s.at < LINGER)
    .sort((a, b) => a.at - b.at);

  return (
    <div className="session">
      <CallFrame fresh={fresh} elapsed={elapsed} />

      <div className="transport">
        <button className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="transport-strip">
          <Strip duration={duration} position={elapsed} onScrub={seek} />
        </div>
        <button className="skip" onClick={finish}>Skip to notes</button>
      </div>
    </div>
  );
}
