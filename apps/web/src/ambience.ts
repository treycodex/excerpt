/**
 * A procedural ambient bed for the demo.
 *
 * Synthesised rather than shipped as a file: no asset to download, no loop seam,
 * and it can drift indefinitely without repeating. An A-minor drone under a band
 * of filtered air, everything moving slowly and quietly enough to be felt rather
 * than listened to.
 *
 * Muted by default. Autoplaying audio is the fastest way to make someone close a
 * tab, so nothing here starts without a click.
 */

/** A minor, low and open. Fifths and octaves keep it from sounding like a chord. */
const VOICES = [
  { hz: 55.00, gain: 0.16, drift: 0.021 },  // A1
  { hz: 82.41, gain: 0.11, drift: 0.017 },  // E2
  { hz: 110.0, gain: 0.09, drift: 0.013 },  // A2
  { hz: 130.8, gain: 0.05, drift: 0.011 },  // C3 — the minor third, kept quiet
  { hz: 164.8, gain: 0.04, drift: 0.009 },  // E3
];

/** Exponentially decaying noise: a small room, generated rather than sampled. */
function impulseResponse(ctx: BaseAudioContext, seconds = 2.6, decay = 2.4): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return buffer;
}

function pinkish(ctx: BaseAudioContext, seconds = 4): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.0990460;
    b1 = 0.96300 * b1 + white * 0.2965164;
    b2 = 0.57000 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
  }
  return buffer;
}

/** Builds the graph into any context, so it can also be rendered offline for testing. */
export function buildAmbience(ctx: BaseAudioContext, destination: AudioNode): AudioNode[] {
  const started: AudioNode[] = [];

  const reverb = ctx.createConvolver();
  reverb.buffer = impulseResponse(ctx);

  const shelf = ctx.createBiquadFilter();
  shelf.type = 'lowpass';
  shelf.frequency.value = 620;
  shelf.Q.value = 0.4;

  // A very slow sweep keeps the bed from sitting still.
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 0.024;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 190;
  sweep.connect(sweepDepth).connect(shelf.frequency);
  sweep.start();
  started.push(sweep);

  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  shelf.connect(reverb).connect(wet).connect(destination);
  shelf.connect(destination);

  for (const voice of VOICES) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = voice.hz;

    // A touch of detune per voice stops the drone sounding synthetic.
    const detune = ctx.createOscillator();
    detune.frequency.value = voice.drift * 0.5;
    const detuneDepth = ctx.createGain();
    detuneDepth.gain.value = 4;
    detune.connect(detuneDepth).connect(osc.detune);
    detune.start();

    const gain = ctx.createGain();
    gain.gain.value = voice.gain * 0.6;

    // Each voice breathes on its own cycle, so the texture never repeats.
    const breath = ctx.createOscillator();
    breath.frequency.value = voice.drift;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = voice.gain * 0.4;
    breath.connect(breathDepth).connect(gain.gain);
    breath.start();

    osc.connect(gain).connect(shelf);
    osc.start();
    started.push(osc, detune, breath);
  }

  // Air: quiet filtered noise, well above the drone so the two do not fight.
  const noise = ctx.createBufferSource();
  noise.buffer = pinkish(ctx);
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1900;
  band.Q.value = 0.8;
  const air = ctx.createGain();
  air.gain.value = 0.05;
  noise.connect(band).connect(air).connect(reverb);
  noise.start();
  started.push(noise);

  return started;
}

export interface Ambience {
  start(): Promise<void>;
  stop(): void;
}

export function createAmbience(): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let nodes: AudioNode[] = [];

  return {
    async start() {
      if (ctx) return;
      ctx = new AudioContext();
      await ctx.resume();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      nodes = buildAmbience(ctx, master);
      // Fade in over four seconds; arriving is part of the effect.
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4);
    },
    stop() {
      if (!ctx || !master) return;
      const dying = ctx;
      const out = master;
      out.gain.cancelScheduledValues(dying.currentTime);
      out.gain.setValueAtTime(out.gain.value, dying.currentTime);
      out.gain.linearRampToValueAtTime(0, dying.currentTime + 1.2);
      setTimeout(() => {
        nodes.forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* already stopped */ } });
        void dying.close().catch(() => {});
      }, 1400);
      ctx = null;
      master = null;
      nodes = [];
    },
  };
}
