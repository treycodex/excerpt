import { afterEach, describe, expect, it, vi } from 'vitest';

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
