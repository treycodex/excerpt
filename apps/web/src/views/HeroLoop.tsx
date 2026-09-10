import { useEffect, useMemo, useState } from 'react';
import { DemoTranscriptAdapter } from '@excerpt/core';
import { DEMO_SCRIPT } from '../demo/script';
import { CallFrame } from './CallFrame';
import type { Spoken } from './CallFrame';

const LINGER = 3200;

/**
 * The hero is the product doing its job: a meeting with Excerpt's captions running
 * over it, on a loop. No stock footage, no new assets — the same demo adapter and
 * caption component the real session uses, so the hero can never drift from the
 * product it is advertising.
 */
export function HeroLoop() {
  const adapter = useMemo(
    () => new DemoTranscriptAdapter(DEMO_SCRIPT, 'hero', 1.35),
    [],
  );
  const [spoken, setSpoken] = useState<Record<string, Spoken>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    const off = adapter.onEvent((e) => {
      setSpoken((prev) => ({
        ...prev,
        [e.role]: { text: e.text, at: performance.now(), label: e.speakerLabel },
      }));
    });

    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        await adapter.start(0);
        await new Promise((r) => setTimeout(r, (adapter.duration + 2500) / 1.35));
        if (cancelled) break;
        await adapter.stop();
        setSpoken({});
        await new Promise((r) => setTimeout(r, 600));
      }
    };
    void run();

    const tick = setInterval(() => setTick((t) => t + 1), 250);
    return () => { cancelled = true; off(); clearInterval(tick); void adapter.stop(); };
  }, [adapter]);

  const now = performance.now();
  const fresh = Object.values(spoken)
    .filter((s) => now - s.at < LINGER)
    .sort((a, b) => a.at - b.at);

  return (
    <div className="hero-loop" aria-hidden>
      <CallFrame fresh={fresh} elapsed={0} bare />
    </div>
  );
}
