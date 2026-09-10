#!/usr/bin/env node
// Generates CaptionTokens.generated.swift from packages/ui/src/tokens.css.
//
// The plan says the Mac app reads the same caption definitions as the web app.
// A copied constant is not the same definition — it is a copy that drifts. This
// reads the CSS and emits Swift, so there is exactly one place a preset is defined.
//
//   node tools/sync-caption-tokens.mjs           write the Swift file
//   node tools/sync-caption-tokens.mjs --check   fail if it is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = resolve(here, '../../../packages/ui/src/tokens.css');
const OUT = resolve(here, '../Sources/Excerpt/Captions/CaptionTokens.generated.swift');

// Comments sit between declarations, so strip them before splitting on `;`.
const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Declarations of one rule, found by its selector. Caption rules have no nested braces. */
function block(selector) {
  const i = css.indexOf(selector + ' {');
  if (i < 0) throw new Error(`selector not found in tokens.css: ${selector}`);
  const open = css.indexOf('{', i), close = css.indexOf('}', open);
  const out = {};
  for (const line of css.slice(open + 1, close).split(';')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/\s+/g, ' ');
  }
  return out;
}

const base = block(':root');
const presets = {
  classic: base,
  warm: { ...base, ...block('[data-caption="warm"]') },
  contrast: { ...base, ...block('[data-caption="contrast"]') },
};

const num = (s) => { const v = parseFloat(s); if (Number.isNaN(v)) throw new Error(`not a number: ${s}`); return v; };

/** `clamp(20px, 2.4vw, 30px)` -> [20, 0.024, 30]. The vw term becomes a fraction of
 *  the screen width, which is the Mac's equivalent viewport. */
function clampRange(v) {
  const m = v.match(/clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)/);
  if (!m) { const n = num(v); return [n, 0, n]; }
  return [num(m[1]), num(m[2]) / 100, num(m[3])];
}

/** #rgb / #rrggbb / rgba(r,g,b,a) / transparent -> {r,g,b,a} in 0…1, or null. */
function color(v) {
  v = v.trim();
  if (v === 'transparent' || v === 'none') return null;
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16) / 255, g: parseInt(m[1].slice(2, 4), 16) / 255, b: parseInt(m[1].slice(4, 6), 16) / 255, a: 1 };
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16) / 255, g: parseInt(m[1][1] + m[1][1], 16) / 255, b: parseInt(m[1][2] + m[1][2], 16) / 255, a: 1 };
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
  if (m) return { r: num(m[1]) / 255, g: num(m[2]) / 255, b: num(m[3]) / 255, a: m[4] === undefined ? 1 : num(m[4]) };
  throw new Error(`unrecognised colour: ${v}`);
}

/** A CSS text-shadow list -> [{x, y, blur, color}]. Splits on commas outside rgba(). */
function shadows(v) {
  if (!v || v.trim() === 'none') return [];
  const parts = [];
  let depth = 0, buf = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; } else buf += ch;
  }
  parts.push(buf);
  return parts.map((p) => {
    const m = p.trim().match(/^(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(.+)$/);
    if (!m) throw new Error(`unrecognised shadow: ${p}`);
    return { x: num(m[1]), y: num(m[2]), blur: num(m[3]), color: color(m[4]) };
  });
}

/** `0` | `4px 14px` -> [vertical, horizontal]. */
function padding(v) {
  const n = v.trim().split(/\s+/).map(num);
  return n.length === 1 ? [n[0], n[0]] : [n[0], n[1]];
}

const [sizeMin, sizeViewportFactor, sizeMax] = clampRange(base['--cap-size']);
const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const swiftColor = (c) => `Color(.sRGB, red: ${f(c.r)}, green: ${f(c.g)}, blue: ${f(c.b)}, opacity: ${f(c.a)})`;

/** The chrome palette — Motif 5, The Ground. Same values, same one accent. */
const PALETTE = [
  ['ground', '--ground'], ['raise', '--raise'], ['line', '--line'], ['lineStrong', '--line-strong'],
  ['ink', '--ink'], ['dim', '--dim'], ['faint', '--faint'],
  ['ember', '--ember'], ['emberDim', '--ember-dim'],
  ['ok', '--ok'], ['warn', '--warn'], ['bad', '--bad'],
];

function swiftPreset(name, p) {
  const sh = shadows(p['--cap-shadow']).map((s) => `            .init(x: ${f(s.x)}, y: ${f(s.y)}, radius: ${f(s.blur)}, color: ${swiftColor(s.color)}),`);
  const back = color(p['--cap-backdrop']);
  const [padV, padH] = padding(p['--cap-pad']);
  return `    static let ${name} = Preset(
        color: ${swiftColor(color(p['--cap-color']))},
        shadows: [
${sh.join('\n') || '            // none — the plate carries legibility instead'}
        ],
        backdrop: ${back ? swiftColor(back) : 'nil'},
        padding: EdgeInsets(top: ${f(padV)}, leading: ${f(padH)}, bottom: ${f(padV)}, trailing: ${f(padH)})
    )`;
}

const swift = `// Generated by tools/sync-caption-tokens.mjs — do not edit.
// Source of truth: packages/ui/src/tokens.css. Re-run after changing a caption token.
//
// One mapping is an approximation and is worth knowing about: a CSS text-shadow's
// blur length and a SwiftUI shadow's radius are not the same quantity. They are
// carried across 1:1 because that is the pairing the Stage 0 overlay was judged by
// eye against the web captions — a spec-correct blur/2 would visibly thin them.
import SwiftUI

enum CaptionTokens {
    /// The caption is a film subtitle: two lines, centred, never a paragraph.
    static let sizeMin: CGFloat = ${f(sizeMin)}
    static let sizeMax: CGFloat = ${f(sizeMax)}
    /// The vw term of the same clamp, as a fraction. On a Mac the screen is the viewport.
    static let sizeViewportFactor: CGFloat = ${sizeViewportFactor}
    static let leading: CGFloat = ${f(num(base['--cap-leading']))}
    /// Tracking is stored in em because it is size-relative — Apple's rule that
    /// tracking is size-specific, not one value for every size.
    static let trackingEm: CGFloat = ${f(num(base['--cap-tracking']))}
    static let weight = Font.Weight.regular            // --cap-weight: ${base['--cap-weight']}
    static let maxLines = ${num(base['--cap-max-lines'])}
    static let maxCharsPerLine = ${num(base['--cap-max-chars'])}
    /// Vertical centre of the caption, as a fraction of the screen from the top.
    static let centreFraction: CGFloat = ${f(num(base['--cap-bottom']) / 100)}
    static let fade: Double = ${f(num(base['--cap-fade']) / 1000)}

    /// Motif 5, The Ground: near-black, a narrow grey ramp, and ONE accent whose only
    /// meaning is settled. If ember appears more than a few times on a screen, it is
    /// being misused.
    enum Palette {
${PALETTE.map(([name, token]) => `        static let ${name} = ${swiftColor(color(base[token]))}`).join('\n')}
    }

    struct Shadow: Equatable, Sendable {
        var x: CGFloat
        var y: CGFloat
        var radius: CGFloat
        var color: Color
    }

    struct Preset: Equatable, Sendable {
        var color: Color
        var shadows: [Shadow]
        /// A plate behind the text. Only Contrast has one; it breaks the no-box rule
        /// on purpose, because legibility beats the aesthetic.
        var backdrop: Color?
        var padding: EdgeInsets
    }

${swiftPreset('classic', presets.classic)}

${swiftPreset('warm', presets.warm)}

${swiftPreset('contrast', presets.contrast)}
}
`;

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch {}
  if (current !== swift) {
    console.error('CaptionTokens.generated.swift is out of date — run: node tools/sync-caption-tokens.mjs');
    process.exit(1);
  }
  console.log('caption tokens in sync');
} else {
  writeFileSync(OUT, swift);
  console.log(`wrote ${OUT}`);
}
