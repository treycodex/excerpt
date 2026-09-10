import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DemoTranscriptAdapter } from '@excerpt/core';
import { Strip } from '@excerpt/ui';
import type { TranscriptEvent } from '@excerpt/types';
import { DEMO_SCRIPT } from '../demo/script';
import { CallFrame, Captions } from './CallFrame';
import type { Spoken } from './CallFrame';
import { openCaptionWindow, supportsPiP } from '../pip';
import { createAmbience } from '../ambience';
import type { Ambience } from '../ambience';

const LINGER = 3200;

export function Session({ onEnd }: { onEnd: (events: TranscriptEvent[]) => void }) {
  const adapter = useMemo(() => new DemoTranscriptAdapter(DEMO_SCRIPT, 'demo-session', 1), []);
  const duration = adapter.duration + 2000;

  const [spoken, setSpoken] = useState<Record<string, Spoken>>({});
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pip, setPip] = useState<Document | null>(null);
  const [contrast, setContrast] = useState(false);
  const [sound, setSound] = useState(false);
  const ambience = useRef<Ambience | null>(null);
  const collected = useRef<TranscriptEvent[]>([]);
  const base = useRef({ at: performance.now(), offset: 0 });

  const finish = useCallback(() => {
    ambience.current?.stop();
    ambience.current = null;
    pip?.defaultView?.close();
    void adapter.stop();
    onEnd(adapter.finalsUpTo(adapter.duration));
  }, [adapter, onEnd, pip]);

  // The bed never outlives the session, and never starts without a click.
  useEffect(() => () => { ambience.current?.stop(); ambience.current = null; }, []);
  useEffect(() => () => { pip?.defaultView?.close(); }, [pip]);

  useEffect(() => {
    const off = adapter.onEvent((e) => {
      if (e.isFinal) collected.current.push(e);
      setSpoken((prev) => ({
        ...prev,
        [e.role]: { text: e.text, at: performance.now(), label: e.speakerLabel, final: e.isFinal },
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

      {pip && createPortal(<Captions fresh={fresh} standalone />, pip.body)}

      <div className="transport">
        <button className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="transport-strip">
          <Strip duration={duration} position={elapsed} onScrub={seek} />
        </div>
        <button
          className="sound"
          aria-pressed={sound}
          onClick={async () => {
            if (sound) { ambience.current?.stop(); ambience.current = null; setSound(false); return; }
            ambience.current = createAmbience();
            await ambience.current.start();
            setSound(true);
          }}
        >
          {sound ? 'Sound off' : 'Sound on'}
        </button>
        <button
          className="contrast"
          aria-pressed={contrast}
          onClick={() => {
            const next = !contrast;
            setContrast(next);
            document.documentElement.classList.toggle('caption-contrast', next);
            pip?.documentElement.classList.toggle('caption-contrast', next);
          }}
        >
          {contrast ? 'Plain captions' : 'High contrast'}
        </button>
        {supportsPiP() && (
          <button
            className="pip"
            onClick={async () => {
              if (pip) { pip.defaultView?.close(); setPip(null); return; }
              const doc = await openCaptionWindow();
              if (!doc) return;
              doc.defaultView?.addEventListener('pagehide', () => setPip(null));
              setPip(doc);
            }}
          >
            {pip ? 'Close float' : 'Float captions'}
          </button>
        )}
        <button className="skip" onClick={finish}>Skip to notes</button>
      </div>
    </div>
  );
}
