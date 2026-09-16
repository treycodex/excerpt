import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamDiagnostics } from './live';

function track(label: string) {
  return { kind: 'audio', label, readyState: 'live', stop: vi.fn(), onended: null } as unknown as MediaStreamTrack;
}

function stream(audio: MediaStreamTrack) {
  return {
    getAudioTracks: () => [audio],
    getTracks: () => [audio],
  } as unknown as MediaStream;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('LiveCaptureAdapter lifecycle', () => {
  it('releases the display stream when microphone access fails', async () => {
    const shared = track('Shared audio');
    vi.stubGlobal('SpeechRecognition', class { static install = vi.fn(); });
    vi.stubGlobal('navigator', { mediaDevices: {
      getDisplayMedia: vi.fn().mockResolvedValue(stream(shared)),
      getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
    } });

    const { LiveCaptureAdapter } = await import('./live');
    const adapter = new LiveCaptureAdapter({ sessionId: 'test' });
    await adapter.start();

    expect(shared.stop).toHaveBeenCalledOnce();
    expect(adapter.status).toEqual({ kind: 'error', message: 'Microphone was declined (NotAllowedError).' });
  });

  it('aborts both recognizers and releases both tracks on stop', async () => {
    const shared = track('Shared audio');
    const mic = track('Physical microphone');
    const recognizers: Array<{ abort: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
    class Recognition extends EventTarget {
      static install = vi.fn().mockResolvedValue(true);
      lang = ''; continuous = false; interimResults = false; processLocally = false;
      onresult = null; onerror = null; onend = null;
      abort = vi.fn(); stop = vi.fn(); start = vi.fn();
      constructor() { super(); recognizers.push(this); }
    }
    vi.stubGlobal('SpeechRecognition', Recognition);
    vi.stubGlobal('navigator', { mediaDevices: {
      getDisplayMedia: vi.fn().mockResolvedValue(stream(shared)),
      getUserMedia: vi.fn().mockResolvedValue(stream(mic)),
    } });

    const { LiveCaptureAdapter } = await import('./live');
    const adapter = new LiveCaptureAdapter({ sessionId: 'test' });
    await adapter.start();
    expect(adapter.status.kind).toBe('running');

    await adapter.stop();
    expect(recognizers).toHaveLength(2);
    expect(recognizers.every((r) => r.abort.mock.calls.length === 1)).toBe(true);
    expect(shared.stop).toHaveBeenCalledOnce();
    expect(mic.stop).toHaveBeenCalledOnce();
  });

  it('does not attach recognizers when stopped during language installation', async () => {
    const shared = track('Shared audio');
    const mic = track('Physical microphone');
    let finishInstall!: (value: boolean) => void;
    const install = vi.fn(() => new Promise<boolean>((resolve) => { finishInstall = resolve; }));
    const startRecognition = vi.fn();
    class Recognition extends EventTarget {
      static install = install;
      lang = ''; continuous = false; interimResults = false; processLocally = false;
      onresult = null; onerror = null; onend = null;
      abort = vi.fn(); stop = vi.fn(); start = startRecognition;
    }
    vi.stubGlobal('SpeechRecognition', Recognition);
    vi.stubGlobal('navigator', { mediaDevices: {
      getDisplayMedia: vi.fn().mockResolvedValue(stream(shared)),
      getUserMedia: vi.fn().mockResolvedValue(stream(mic)),
    } });

    const { LiveCaptureAdapter } = await import('./live');
    const adapter = new LiveCaptureAdapter({ sessionId: 'test' });
    const starting = adapter.start();
    await vi.waitFor(() => expect(install).toHaveBeenCalledOnce());
    await adapter.stop();
    finishInstall(true);
    await starting;

    expect(startRecognition).not.toHaveBeenCalled();
    expect(shared.stop).toHaveBeenCalledOnce();
    expect(mic.stop).toHaveBeenCalledOnce();
  });
});

describe('a recognizer that dies mid-meeting', () => {
  const diag = (over: Partial<StreamDiagnostics> = {}): StreamDiagnostics => ({
    role: 'remote', label: 'SPEAKER', level: 0, voicedSeconds: 600,
    voicedSinceFinal: 0, sinceFinal: 0, sinceVoiced: 0, finals: 40, interims: 300,
    restarts: 0, started: true, events: [], ...over,
  });

  it('is not confused with a quiet room', async () => {
    const { isStalled } = await import('./live');
    // Forty minutes in, nobody has spoken for two of them. Nothing is wrong.
    expect(isStalled(diag({ sinceFinal: 120, voicedSinceFinal: 0 }))).toBe(false);
  });

  it('is not tripped by the gap between a long sentence and its final', async () => {
    const { isStalled } = await import('./live');
    expect(isStalled(diag({ sinceFinal: 12, voicedSinceFinal: 11 }))).toBe(false);
  });

  it('is caught even though the stream recognised plenty earlier', async () => {
    // The old check asked whether this stream had EVER produced a result, which
    // stays true for the rest of the meeting once it has.
    const { isStalled } = await import('./live');
    expect(isStalled(diag({ sinceFinal: 90, voicedSinceFinal: 45 }))).toBe(true);
  });

  it('is caught as soon as restarting has been abandoned', async () => {
    const { isStalled } = await import('./live');
    expect(isStalled(diag({ gaveUp: true }))).toBe(true);
  });
});

describe('restarting a recognizer that keeps failing', () => {
  it('backs off, gives up, and says so, instead of looping forever', async () => {
    vi.useFakeTimers();
    const shared = track('Shared audio');
    const mic = track('Physical microphone');
    const made: any[] = [];
    class Recognition extends EventTarget {
      static install = vi.fn().mockResolvedValue(true);
      lang = ''; continuous = false; interimResults = false; processLocally = false;
      onresult = null; onerror = null; onend: (() => void) | null = null;
      abort = vi.fn(); stop = vi.fn(); start = vi.fn();
      constructor() { super(); made.push(this); }
    }
    vi.stubGlobal('SpeechRecognition', Recognition);
    vi.stubGlobal('navigator', { mediaDevices: {
      getDisplayMedia: vi.fn().mockResolvedValue(stream(shared)),
      getUserMedia: vi.fn().mockResolvedValue(stream(mic)),
    } });

    const { LiveCaptureAdapter, isStalled } = await import('./live');
    const adapter = new LiveCaptureAdapter({ sessionId: 'test' });
    await adapter.start();

    const rec = made[0]!;
    const initial = rec.start.mock.calls.length;
    // Every restart ends the same way it began, as a persistent `network` error
    // does. Unbounded, this is roughly eight attempts a second, forever.
    for (let i = 0; i < 40; i++) {
      rec.onend?.();
      await vi.advanceTimersByTimeAsync(30_000);
    }

    const restarts = rec.start.mock.calls.length - initial;
    expect(restarts).toBeGreaterThan(0);
    expect(restarts).toBeLessThanOrEqual(12);
    expect(adapter.diagnostics['remote']?.gaveUp).toBe(true);
    expect(isStalled(adapter.diagnostics['remote']!)).toBe(true);

    await adapter.stop();
    vi.useRealTimers();
  });
});

describe('what the diagnostics panel counts', () => {
  /** One recognition result, in the shape Web Speech delivers it. */
  const result = (transcript: string, isFinal: boolean) =>
    ({ results: [Object.assign([{ transcript }], { isFinal })] });

  const running = async () => {
    const shared = track('Shared audio');
    const mic = track('Physical microphone');
    const made: any[] = [];
    class Recognition extends EventTarget {
      static install = vi.fn().mockResolvedValue(true);
      lang = ''; continuous = false; interimResults = false; processLocally = false;
      onresult: ((e: any) => void) | null = null; onerror = null; onend = null;
      abort = vi.fn(); stop = vi.fn(); start = vi.fn();
      constructor() { super(); made.push(this); }
    }
    vi.stubGlobal('SpeechRecognition', Recognition);
    vi.stubGlobal('navigator', { mediaDevices: {
      getDisplayMedia: vi.fn().mockResolvedValue(stream(shared)),
      getUserMedia: vi.fn().mockResolvedValue(stream(mic)),
    } });
    const { LiveCaptureAdapter } = await import('./live');
    const adapter = new LiveCaptureAdapter({ sessionId: 'test' });
    await adapter.start();
    return { adapter, rec: made[0]! };
  };

  it('counts one final result once, not twice', async () => {
    // It was incremented on the result AND again on the commit the result makes,
    // so the one panel that says whether capture is healthy read double.
    const { adapter, rec } = await running();
    rec.onresult!(result('We went with the coastline cut.', true));
    expect(adapter.diagnostics['remote']?.finals).toBe(1);
    await adapter.stop();
  });

  it('counts interims separately and leaves finals alone', async () => {
    const { adapter, rec } = await running();
    rec.onresult!(result('We went with', false));
    rec.onresult!(result('We went with the', false));
    expect(adapter.diagnostics['remote']?.interims).toBe(2);
    expect(adapter.diagnostics['remote']?.finals).toBe(0);
    await adapter.stop();
  });

  it('counts the finals a run of results actually emits', async () => {
    const { adapter, rec } = await running();
    for (const text of ['One thing settled.', 'Another thing settled.', 'A third.']) {
      rec.onresult!(result(text, true));
    }
    expect(adapter.diagnostics['remote']?.finals).toBe(3);
    await adapter.stop();
  });
});

describe('what one source is doing', () => {
  const diag = (over: Partial<StreamDiagnostics> = {}): StreamDiagnostics => ({
    role: 'you', label: 'YOU', level: 0, voicedSeconds: 300,
    voicedSinceFinal: 0, sinceFinal: 2, sinceVoiced: 0, finals: 20, interims: 150,
    restarts: 0, started: true, events: [], ...over,
  });

  it('separates a source nobody is speaking into from one that is broken', async () => {
    const { sourceHealth } = await import('./live');
    // The whole point of the split: these two were one green aggregate.
    expect(sourceHealth(diag({ sinceVoiced: 45 }))).toBe('silent');
    expect(sourceHealth(diag({ sinceVoiced: 0, voicedSinceFinal: 20, sinceFinal: 60 }))).toBe('stalled');
  });

  it('does not call a stream healthy because it heard something once', async () => {
    // voicedSeconds is cumulative and never decays, which is what made the old
    // aggregate go green on second one and stay green after the mic died.
    const { sourceHealth } = await import('./live');
    expect(sourceHealth(diag({ voicedSeconds: 600, sinceVoiced: 90 }))).toBe('silent');
  });

  it('reports a stream that is being spoken into right now', async () => {
    const { sourceHealth } = await import('./live');
    expect(sourceHealth(diag({ sinceVoiced: 0.4 }))).toBe('hearing');
    expect(sourceHealth(diag({ sinceVoiced: 3.9 }))).toBe('hearing');
  });

  it('reports a device that went away, and one still starting', async () => {
    const { sourceHealth } = await import('./live');
    expect(sourceHealth(diag({ lastError: 'audio-capture' }))).toBe('failed');
    expect(sourceHealth(diag({ gaveUp: true }))).toBe('failed');
    expect(sourceHealth(diag({ started: false }))).toBe('starting');
  });

  it('never reports hearing on a stream that has heard nothing at all', async () => {
    const { sourceHealth } = await import('./live');
    expect(sourceHealth(diag({ voicedSeconds: 0, sinceVoiced: Infinity }))).toBe('silent');
  });
});

describe('keeping the far side out of your own transcript', () => {
  it('keeps accented words instead of discarding them', async () => {
    // Stripping to [a-z0-9' ] deleted these tokens, and enough deletions took the
    // line under the three-word floor, which switches echo suppression off
    // silently. Attribution is the one thing two streams are for.
    const { echoWords } = await import('./live');
    expect([...echoWords('Ask Ángela about the Grégoire edit')])
      .toEqual(['ask', 'ángela', 'about', 'the', 'grégoire', 'edit']);
  });

  it('still drops punctuation and short words', async () => {
    const { echoWords } = await import('./live');
    expect([...echoWords('So — we, uh, agreed?')]).toEqual(['agreed']);
  });

  it('leaves a line of accented speech judgeable at all', async () => {
    const { echoWords } = await import('./live');
    // Under the old tokeniser this set was empty, so `mine.size < 3` returned
    // false and the line was never compared against the far side.
    expect(echoWords('Perquè això és el que va dir').size).toBeGreaterThanOrEqual(3);
  });
});
