#!/usr/bin/env node
/**
 * The film's soundtrack, synthesised from nothing and timed to the cut.
 *
 *   node scripts/score.mjs        → public/audio/soundtrack.wav (48 kHz, 16-bit stereo)
 *
 * No samples, no library, no licence: every sound is maths in this file, so the
 * score is the project's own. It reads the cut (src/timeline.ts through
 * src/schedule.ts, the same code the film lays itself out with), so the drop lands
 * on the first cut, a whoosh sits under every transition, a hit under every stamp,
 * a tick on every click and keys under every shortcut, and the music resolves on
 * the logo. Change the cut, run this again, and the sound follows.
 *
 * Music: 120 BPM, D minor (Dm – B♭ – F – C). A detuned-saw pad through a moving
 * low-pass, a pulsing sub bass and a kick that pumps them (sidechain), offbeat hats,
 * and a plucked arpeggio with a ping-pong echo for the second half. Deterministic:
 * the noise is seeded, so the same cut always renders the same file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCENES } from '../src/timeline.ts';
import { cues } from '../src/schedule.ts';

const SR = 48000;
const { total, drop, close, cues: sheet } = cues(SCENES);
const LEN = Math.ceil((total + 0.2) * SR);
const TAU = Math.PI * 2;

// ── Tools ─────────────────────────────────────────────────────────────────────
let seed = 0x9e3779b9;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; };
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const track = () => [new Float32Array(LEN), new Float32Array(LEN)];
const coef = (fc) => 1 - Math.exp(-TAU * Math.min(fc, SR * 0.45) / SR);
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));

/** Adds a mono sound into a stereo track at time t, panned (-1 … 1). */
function place(dst, snd, t, gain = 1, pan = 0) {
  const start = Math.round(t * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < snd.length; i++) {
    const j = start + i;
    if (j < 0 || j >= LEN) continue;
    dst[0][j] += snd[i] * gl; dst[1][j] += snd[i] * gr;
  }
}

/** A state-variable filter, band-pass output, with the centre set per sample. */
function bandpass(x, centre, q = 1.2) {
  const y = new Float32Array(x.length);
  let lo = 0, bp = 0;
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(centre(i / SR), SR / 6) / SR);
    const hi = x[i] - lo - bp / q;
    bp += f * hi; lo += f * bp;
    y[i] = bp;
  }
  return y;
}

/** Freeverb, trimmed: eight combs and four all-passes per side, a little wider on the right. */
function reverb([l, r], { size = 0.84, damp = 0.35, wet = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const passes = [556, 441, 341, 225];
  const side = (x, spread) => {
    const out = new Float32Array(x.length);
    for (const c of combs) {
      const n = Math.round((c + spread) * SR / 44100), buf = new Float32Array(n);
      let k = 0, store = 0;
      for (let i = 0; i < x.length; i++) {
        const o = buf[k]; store = o * (1 - damp) + store * damp;
        buf[k] = x[i] * 0.015 + store * size; out[i] += o; k = (k + 1) % n;
      }
    }
    for (const a of passes) {
      const n = Math.round((a + spread) * SR / 44100), buf = new Float32Array(n);
      let k = 0;
      for (let i = 0; i < out.length; i++) {
        const b = buf[k], v = -out[i] + b; buf[k] = out[i] + b * 0.5; out[i] = v; k = (k + 1) % n;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] *= wet;
    return out;
  };
  return [side(l, 0), side(r, 23)];
}
const mixInto = (dst, src, g = 1) => { for (let c = 0; c < 2; c++) for (let i = 0; i < LEN; i++) dst[c][i] += src[c][i] * g; };

// ── Sounds ─────────────────────────────────────────────────────────────────────
const SOUNDS = {
  /** Air past the lens: noise through a band-pass sweeping up, swelling then gone. */
  whoosh() {
    const n = Math.round(0.55 * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = rand();
    const y = bandpass(x, (t) => 300 * (18 ** (t / 0.55)), 1.6);
    for (let i = 0; i < n; i++) { const t = i / n; y[i] *= (t < 0.62 ? (t / 0.62) ** 2 : ((1 - t) / 0.38) ** 1.5) * 2.4; }
    return y;
  },
  /** The stamp landing: a short sub drop under a soft transient. */
  hit() {
    const n = Math.round(0.9 * SR), y = new Float32Array(n);
    let ph = 0, lo = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, f = 40 + 45 * Math.exp(-t / 0.05);
      ph += f / SR;
      lo += coef(1800) * (rand() - lo);
      y[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.32) * 0.9 + lo * Math.exp(-t / 0.035) * 1.4;
    }
    return y;
  },
  /** The drop: deeper and longer than a hit. */
  boom() {
    const n = Math.round(2.2 * SR), y = new Float32Array(n);
    let ph = 0, lo = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, f = 28 + 40 * Math.exp(-t / 0.09);
      ph += f / SR;
      lo += coef(700) * (rand() - lo);
      y[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.75) * 1.0 + lo * Math.exp(-t / 0.22) * 1.6;
    }
    return y;
  },
  /** A click: a bright blip and a breath of noise, gone in 40 ms. */
  tick() {
    const n = Math.round(0.05 * SR), y = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, r = rand(), hp = r - prev; prev = r;
      y[i] = Math.sin(TAU * 2600 * t) * Math.exp(-t / 0.006) * 0.5 + hp * Math.exp(-t / 0.003) * 0.35;
    }
    return y;
  },
  /** A key: a soft plastic thock. */
  key() {
    const n = Math.round(0.06 * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = rand();
    const y = bandpass(x, () => 1900, 2.5);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] = y[i] * Math.exp(-t / 0.01) * 1.6 + Math.sin(TAU * 190 * t) * Math.exp(-t / 0.014) * 0.5; }
    return y;
  },
  /** The brackets locking: two metallic clicks, the second lighter. */
  snap() {
    const n = Math.round(0.45 * SR), y = new Float32Array(n);
    const click = (at, g) => {
      for (let i = Math.round(at * SR); i < n; i++) {
        const t = i / SR - at;
        y[i] += g * ([1180, 2730, 4090, 5610].reduce((s, f, k) => s + Math.sin(TAU * f * t) / (k + 1), 0) * Math.exp(-t / 0.05) * 0.5 + rand() * Math.exp(-t / 0.004) * 0.6);
      }
    };
    click(0, 1); click(0.045, 0.55);
    return y;
  },
  /** Into the drop: filtered noise and a rising tone, cut off as the first scene lands. */
  riser() {
    const len = Math.max(0.5, drop - 0.05), n = Math.round(len * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = rand();
    const y = bandpass(x, (t) => 250 * (14 ** (t / len)), 2);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / n; ph += (110 * 4 ** t) / SR; y[i] = y[i] * t ** 2.2 * 1.6 + Math.sin(TAU * ph) * t ** 3 * 0.12; }
    return y;
  },
};

// ── Music ─────────────────────────────────────────────────────────────────────
const BEAT = 0.5;                       // 120 BPM
const CHORDS = [                        // Dm – B♭ – F – C, voiced close
  { root: 38, notes: [50, 53, 57, 62] },
  { root: 34, notes: [46, 50, 53, 58] },
  { root: 41, notes: [53, 57, 60, 65] },
  { root: 36, notes: [48, 52, 55, 60] },
];
const FINAL = [38, 45, 50, 53, 57, 64]; // Dm add9, for the logo
const chordAt = (t) => t < drop ? CHORDS[0] : CHORDS[Math.floor((t - drop) / (BEAT * 8)) % 4];
const kicks = [];
for (let t = drop; t < close - 0.01; t += BEAT) kicks.push(t);

const music = track();
const pumpAt = (() => {
  // Sidechain: everything melodic ducks under the kick and breathes back.
  const env = new Float32Array(LEN).fill(1);
  for (const k of kicks) for (let i = Math.round(k * SR), j = 0; j < SR * 0.3 && i + j < LEN; j++) env[i + j] = Math.min(env[i + j], 1 - 0.55 * Math.exp(-j / SR / 0.11));
  return env;
})();

// Pad: detuned saws per chord tone, a filter that opens into the drop and drifts.
{
  const pad = track();
  const segs = [];
  segs.push({ from: 0, to: drop, notes: CHORDS[0].notes });
  for (let t = drop; t < close; t += BEAT * 8) segs.push({ from: t, to: Math.min(t + BEAT * 8, close), notes: chordAt(t + 0.01).notes });
  segs.push({ from: close, to: total + 0.2, notes: FINAL, final: true });
  for (const s of segs) {
    const a = s.final ? 0.05 : 0.5, r = s.final ? 1.6 : 0.9;
    for (const [k, m] of s.notes.entries()) {
      for (const det of [-0.11, 0.11]) {
        const f = mtof(m + det);
        let ph = rand() * 0.5 + 0.5;
        const start = Math.round(s.from * SR), end = Math.min(LEN, Math.round((s.to + r) * SR));
        const side = det < 0 ? 0 : 1;
        for (let i = start; i < end; i++) {
          const t = i / SR - s.from, dur = s.to - s.from;
          const env = Math.min(1, t / a) * (t > dur ? Math.max(0, 1 - (t - dur) / r) : 1);
          ph += f / SR;
          pad[side][i] += saw(ph) * env * 0.05 * (k === 0 ? 1.1 : 1);
        }
      }
    }
  }
  // Filter: 380 Hz opening to 1500 by the drop, then an LFO around 1300; brighter on the logo.
  let l1 = [0, 0], l2 = [0, 0];
  for (let i = 0; i < LEN; i++) {
    const t = i / SR;
    const fc = t < drop ? 380 * (4 ** (t / drop)) : t < close ? 1300 + 380 * Math.sin(TAU * 0.11 * (t - drop)) : 2200 * Math.exp(-(t - close) / 2.5) + 600;
    const a = coef(fc);
    for (let c = 0; c < 2; c++) { l1[c] += a * (pad[c][i] - l1[c]); l2[c] += a * (l1[c] - l2[c]); pad[c][i] = l2[c] * pumpAt[i]; }
  }
  mixInto(music, pad, 1);
  mixInto(music, reverb(pad, { size: 0.86, wet: 0.9 }), 1);
}

// Sub bass: eighth-note pulses on the root, pumping with the kick.
{
  const bass = track();
  for (let t = drop; t < close - 0.01; t += BEAT / 2) {
    const f = mtof(chordAt(t + 0.01).root - 12 + 12), n = Math.round(0.24 * SR);
    const y = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const u = i / SR; ph += f / SR; y[i] = (Math.sin(TAU * ph) + 0.25 * Math.sin(TAU * 2 * ph) + 0.08 * saw(ph)) * Math.min(1, u / 0.004) * Math.exp(-u / 0.16); }
    place(bass, y, t, 0.34);
  }
  for (let c = 0; c < 2; c++) for (let i = 0; i < LEN; i++) bass[c][i] *= pumpAt[i];
  mixInto(music, bass);
}

// Kick on every beat; hats on the offbeats from the second phrase.
{
  const drums = track();
  const kick = (() => {
    const n = Math.round(0.4 * SR), y = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (46 + 115 * Math.exp(-t / 0.028)) / SR; y[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.2) + rand() * Math.exp(-t / 0.002) * 0.3; }
    return y;
  })();
  for (const k of kicks) place(drums, kick, k, 0.62);
  let prev = 0;
  const hat = (() => { const n = Math.round(0.07 * SR), y = new Float32Array(n); for (let i = 0; i < n; i++) { const r = rand(); y[i] = (r - prev) * Math.exp(-i / SR / 0.028); prev = r; } return y; })();
  let side = 1;
  for (let t = drop + BEAT * 8 + BEAT / 2; t < close - 0.01; t += BEAT) { place(drums, hat, t, 0.09, 0.25 * (side = -side)); }
  mixInto(music, drums);
}

// Arpeggio: 16th-note plucks up the chord for the second half, echoing side to side.
{
  const arp = track();
  const start = drop + BEAT * 8 * 3;
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
  let step = 0;
  for (let t = start; t < close - 0.01; t += BEAT / 4, step++) {
    const notes = chordAt(t + 0.01).notes, m = notes[pattern[step % pattern.length]] + 12;
    const f = mtof(m), n = Math.round(0.3 * SR), y = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / SR; y[i] = (Math.sin(TAU * f * u) + 0.4 * Math.sin(TAU * 2 * f * u) * Math.exp(-u / 0.03)) * Math.exp(-u / 0.11); }
    place(arp, y, t, 0.07 * (step % 4 === 0 ? 1.25 : 1), step % 2 ? 0.3 : -0.3);
  }
  // Ping-pong: 3/8 of a beat... a dotted eighth, feeding back across the sides.
  const d = Math.round(BEAT * 0.75 * SR), echo = track();
  for (let i = d; i < LEN; i++) { echo[0][i] = arp[1][i - d] * 0.45 + echo[1][i - d] * 0.35; echo[1][i] = arp[0][i - d] * 0.45 + echo[0][i - d] * 0.35; }
  mixInto(arp, echo);
  mixInto(music, arp);
  mixInto(music, reverb(arp, { size: 0.8, wet: 0.5 }));
}

// ── Effects, on the cut ─────────────────────────────────────────────────────────
const fx = track();
const rendered = Object.fromEntries(Object.entries(SOUNDS).map(([k, make]) => [k, make()]));
const LEVEL = { whoosh: 0.5, hit: 0.55, boom: 0.8, tick: 0.35, key: 0.3, snap: 0.45, riser: 0.5 };
for (const c of sheet) {
  // Whooshes travel: left to right, alternating, so consecutive cuts feel like movement.
  const pan = c.sound === 'whoosh' ? (Math.round(c.t * 10) % 2 ? 0.35 : -0.35) : c.sound === 'tick' ? 0.1 : 0;
  place(fx, rendered[c.sound], c.t, LEVEL[c.sound] * (c.gain ?? 1), pan);
}
const fxWet = reverb(fx, { size: 0.78, wet: 0.35 });

// ── Master ──────────────────────────────────────────────────────────────────────
const out = track();
mixInto(out, music, 0.62);
mixInto(out, fx, 1);
mixInto(out, fxWet, 1);
// Fade in over the first 60 ms, out over the last 1.4 s; soft-clip; peak at −1 dBFS.
let peak = 0;
for (let i = 0; i < LEN; i++) {
  const t = i / SR, g = Math.min(1, t / 0.06) * Math.min(1, Math.max(0, (total - t) / 1.4));
  for (let c = 0; c < 2; c++) { const v = Math.tanh(out[c][i] * g * 1.4) / Math.tanh(1.4); out[c][i] = v; peak = Math.max(peak, Math.abs(v)); }
}
const norm = 0.89 / (peak || 1);

// ── WAV ─────────────────────────────────────────────────────────────────────────
const data = Buffer.alloc(LEN * 4);
for (let i = 0; i < LEN; i++) for (let c = 0; c < 2; c++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out[c][i] * norm * 32767))), i * 4 + c * 2);
const head = Buffer.alloc(44);
head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(SR, 24);
head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
mkdirSync('public/audio', { recursive: true });
writeFileSync('public/audio/soundtrack.wav', Buffer.concat([head, data]));
console.log(`soundtrack.wav: ${total.toFixed(2)}s, drop ${drop.toFixed(2)}s, logo ${close.toFixed(2)}s, ${sheet.length} cues, ${kicks.length} kicks`);
