#!/usr/bin/env node
/**
 * Films the after-the-call part of the demo from Excerpt's real editor on the stage
 * (stage/stage.tsx), driven by script instead of by hand: the transcript with the
 * captured slide inline, a correction, Write notes, a Source link, Export.
 *
 *   node scripts/shoot-stage.mjs            → footage/stage.mp4 + footage/stage.actions.jsonl
 *
 * Frames come from Chrome's screencast at 2× (every repaint, timestamped), so the
 * result is sharp and its timing is real. Clicks are logged in page pixels for the
 * edit's drawn cursor, as rec.sh logs them for screen recordings.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const W = 1440, H = 900, SCALE = 2;
const meeting = JSON.parse(readFileSync('footage/stage-meeting.json', 'utf8'));
const server = await createServer({ configFile: 'stage/vite.config.ts', server: { port: 5292, strictPort: true } });
await server.listen();

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
await page.goto(`http://localhost:5292/#/m/${meeting.id}`);
await page.waitForSelector('.transcript');
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: 'html { scroll-behavior: smooth; } *:focus-visible { outline-color: transparent !important; }' });
await page.waitForTimeout(600);

// ── Recording ─────────────────────────────────────────────────────────────────
const dir = 'footage/stage-frames';
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const frames = [];
const cdp = await page.context().newCDPSession(page);
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * SCALE, maxHeight: H * SCALE });
const t0 = Date.now() / 1000;
const actions = [{ shot: 'stage', screen: [W, H] }];
const log = (type, extra) => actions.push({ t: +(Date.now() / 1000 - t0).toFixed(3), type, ...extra });
const hold = (ms) => page.waitForTimeout(ms);

async function click(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  log('click', { x: Math.round(x), y: Math.round(y), label });
  await page.mouse.move(x, y, { steps: 12 });
  await hold(250);
  await locator.click();
}
const button = (name) => page.getByRole('button', { name, exact: true });

// 1. The transcript, then the slide captured during the call, in place.
await hold(1800);
await page.locator('.transcript-capture, .transcript figure, .transcript img').first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await hold(3200);

// 2. A correction: the recognizer heard "docks"; Sam said "docs".
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await hold(1400);
const corrects = page.getByRole('button', { name: 'Correct', exact: true });
await click(corrects.nth(1), 'correct');
const field = page.locator('.transcript textarea').first();
await field.waitFor();
await hold(700);
const text = await field.inputValue();
const cleaned = text.replace(/^[,.\s…]+/, '');
await field.evaluate((el, v) => { el.focus(); el.setSelectionRange(0, el.value.length - v.length); }, cleaned);
await page.keyboard.press('Backspace');
await hold(350);
const at = cleaned.indexOf('docks');
await field.evaluate((el, i) => el.setSelectionRange(i, i + 5), at);
await hold(500);
await page.keyboard.type('docs', { delay: 110 });
await hold(700);
await click(button('Save correction'), 'save-correction');
await hold(2600);

// 3. Notes, only when asked for: Write notes, then a line back to where it was said.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await hold(900);
await click(button('Notes'), 'notes-tab');
await hold(1400);
// The correction has to finish saving before notes can be written from it.
await page.getByText('Saved on this device').waitFor();
const write = page.locator('button:has-text("Write notes"):not([disabled])').first();
await write.waitFor();
await click(write, 'write-notes');
const sources = page.locator('button:visible', { hasText: /^(Source|\d+ sources) ↗$/ });
await sources.first().waitFor({ timeout: 15000 });
await hold(2600);
await click(sources.nth(2), 'source');
await hold(3400);

// 4. Export.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await hold(900);
const exportMenu = page.locator('.toolbar-menu > summary').first();
await click(exportMenu, 'export');
await hold(1200);
const html = page.getByRole('button', { name: 'Save HTML with images…' });
const hb = await html.boundingBox();
log('hover', { x: Math.round(hb.x + hb.width / 2), y: Math.round(hb.y + hb.height / 2), label: 'save-html' });
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2, { steps: 10 });
await hold(2200);

await cdp.send('Page.stopScreencast');
await browser.close();
await server.close();

// ── Assemble at a constant 30 fps from the timestamped repaints ─────────────────
const end = t0 + (Date.now() / 1000 - t0);
const list = frames.map((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 0.5;
  return `file '${f.file.replace('footage/', '')}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`;
}).join('\n') + `\nfile '${frames.at(-1).file.replace('footage/', '')}'\n`;
writeFileSync('footage/stage-frames.txt', list);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'footage/stage-frames.txt',
  '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', 'footage/stage.mp4']);
const offset = frames[0].t - t0;
writeFileSync('footage/stage.actions.jsonl', actions.map((a) => JSON.stringify(a.t === undefined ? a : { ...a, t: +(a.t - offset).toFixed(3) })).join('\n') + '\n');
console.log(`stage.mp4: ${frames.length} repaints, ${(frames.at(-1).t - frames[0].t).toFixed(1)}s; ${actions.length - 1} actions (end ${end.toFixed(0)})`);
