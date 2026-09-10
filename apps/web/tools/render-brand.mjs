#!/usr/bin/env node
/**
 * Renders the brand assets — the [ e ] mark and the Open Graph card — from the same
 * Archivo the site itself uses.
 *
 *   node apps/web/tools/render-brand.mjs
 *
 * Rendered rather than drawn by hand: the mark is type, and hand-tracing it into SVG
 * paths would make a second version of the logo that drifts from the one in
 * `landing.css` the first time the wordmark changes. The values below are copied
 * from `.ed-logo` and `.ed-wordmark`; change them there and re-run this.
 *
 * Needs Chrome and ffmpeg, so it is a developer tool, not part of the build.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(web, 'public');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PAPER = '#f1f0dd';
const GROUND = '#10110f';
const MUTED = '#adada2';

if (!existsSync(CHROME)) {
  console.error('Google Chrome is required to render the brand assets.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'excerpt-brand-'));
copyFileSync(join(publicDir, 'fonts/Archivo-Variable.woff2'), join(work, 'Archivo-Variable.woff2'));

const face = `@font-face { font-family:"Archivo"; font-weight:400 900;
  src:url("Archivo-Variable.woff2") format("woff2-variations"); }`;

// The mark: "[ e ]" exactly as `.ed-logo` sets it — weight 600, and the site's -4px
// at 30px written as the em value so the kerning holds at any size.
writeFileSync(join(work, 'mark.html'), `<!doctype html><meta charset="utf-8"><style>${face}
  html,body{margin:0}
  body{width:512px;height:512px;background:${GROUND};color:${PAPER};
       font-family:"Archivo",sans-serif;display:grid;place-items:center}
  .mark{font-size:270px;font-weight:600;letter-spacing:-0.133em;line-height:1;
        white-space:nowrap;text-indent:-0.133em}
</style><div class="mark">[ e ]</div>`);

writeFileSync(join(work, 'og.html'), `<!doctype html><meta charset="utf-8"><style>${face}
  html,body{margin:0}
  body{width:1200px;height:630px;background:${GROUND};color:${PAPER};font-family:"Archivo",sans-serif;
       padding:64px 72px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between}
  .top{display:flex;justify-content:space-between;font-size:17px;letter-spacing:.09em;
       font-family:ui-monospace,Menlo,monospace;color:${MUTED}}
  .wordmark{font-size:205px;font-weight:650;letter-spacing:-.085em;line-height:1.02;margin:0 0 26px -4px}
  .wordmark span{display:inline-block;font-size:.12em;vertical-align:top;padding-top:.75em;padding-left:.25em;letter-spacing:0}
  .tag{font-size:31px;font-weight:500;letter-spacing:-.03em;margin:0}
  .tag em{font-family:Georgia,serif;font-style:italic;font-weight:400}
  .rule{border-top:1px solid #393b32;padding-top:22px;display:flex;justify-content:space-between;
        font-size:16px;letter-spacing:.08em;font-family:ui-monospace,Menlo,monospace;color:${MUTED}}
</style>
<div class="top"><span>FREE, OPEN-SOURCE MEETING NOTES</span><span>CINEMATIC SUBTITLES. CLEAR NOTES.</span></div>
<div><div class="wordmark">excerpt<span>&#10035;</span></div>
<p class="tag">Meeting notes. Cinematic feel. <em>Free. Open source.</em></p></div>
<div class="rule"><span>LIVE SUBTITLES &middot; TRANSCRIPTS &middot; MEETING NOTES</span><span>EXCERPT</span></div>`);

/**
 * Headless Chrome writes the screenshot and then does not exit — measured, and it
 * hangs the script forever if you wait for it. Wait for the file instead, then end
 * the process.
 */
async function shoot(page, out, size) {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', `--window-size=${size}`,
    `--screenshot=${out}`, '--virtual-time-budget=2500',
    '--allow-file-access-from-files', `--user-data-dir=${join(work, 'chrome')}`,
    `file://${page}`,
  ], { stdio: 'ignore' });

  try {
    for (let i = 0; i < 60; i++) {
      if (existsSync(out) && statSync(out).size > 0) return;
      await sleep(500);
    }
    throw new Error(`Chrome never wrote ${out}`);
  } finally {
    chrome.kill();
  }
}

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', ...args], { stdio: 'inherit' });

const mark = join(work, 'mark512.png');
await shoot(join(work, 'mark.html'), mark, '512,512');
await shoot(join(work, 'og.html'), join(publicDir, 'og.png'), '1200,630');

// A favicon should nearly fill its frame, so the small sizes come from a tighter
// crop than the 512 used for a home-screen icon.
const TIGHT = 'crop=396:396:58:58';
for (const [name, px] of [['favicon-32', 32], ['apple-touch-icon', 180], ['icon-192', 192]]) {
  ff(['-i', mark, '-vf', `${TIGHT},scale=${px}:${px}:flags=lanczos`, join(publicDir, `${name}.png`), '-y']);
}
ff(['-i', mark, '-vf', 'scale=512:512', join(publicDir, 'icon-512.png'), '-y']);

rmSync(work, { recursive: true, force: true });
console.log('wrote favicon-32, apple-touch-icon, icon-192, icon-512 and og.png');
