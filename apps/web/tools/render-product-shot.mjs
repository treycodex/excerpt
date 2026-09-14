#!/usr/bin/env node
/**
 * Shoots the landing page's product still from the running product.
 *
 *   pnpm --filter @excerpt/web dev          # in another shell
 *   node apps/web/tools/render-product-shot.mjs
 *
 * There is no mockup here and there is not going to be one. The image on the home
 * page is Excerpt's own notes view, rendered by the same React the app ships,
 * reading a sample meeting written into the same IndexedDB store a real meeting
 * lives in. The design is pasted in through the document's own paste handler, placed
 * on the meeting clock through the product's own placement panel, captioned in the
 * product's own field, and the excerpts beside it come from the real extraction
 * engine. Anything the picture shows, the product does.
 *
 * It runs over the Chrome DevTools Protocol rather than `--screenshot` because the
 * meeting store is per-origin: the run has to *be* the app's origin to write to it.
 * Chrome and a running dev server are the only requirements, so this is a developer
 * tool and not part of the build — like render-brand.mjs beside it.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = resolve(web, '../../packages/core/src/index.ts');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.EXCERPT_URL ?? 'http://localhost:5273';
const PORT = 9333;
const MEETING_ID = 'sample-campaign-review';

/**
 * The two screens the sample review is about, drawn here so nothing real, nobody's
 * client and nothing licensed appears on the home page. Both are labelled inside the
 * picture as samples: a screenshot of a report that looks like somebody's actual
 * account is a claim this product has no business making.
 */
const REPORT = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="600" viewBox="0 0 1040 600">
  <rect width="1040" height="600" fill="#ffffff"/>
  <rect x="0" y="0" width="1040" height="54" fill="#eceada"/>
  <circle cx="28" cy="27" r="6" fill="#c9c6ba"/><circle cx="48" cy="27" r="6" fill="#c9c6ba"/><circle cx="68" cy="27" r="6" fill="#c9c6ba"/>
  <text x="120" y="33" font-family="Helvetica,Arial,sans-serif" font-size="15" fill="#6f6f66">Northside — paid social performance</text>
  <text x="48" y="106" font-family="Helvetica,Arial,sans-serif" font-size="27" font-weight="600" fill="#23241f">Creative performance</text>
  <text x="48" y="140" font-family="Helvetica,Arial,sans-serif" font-size="16" fill="#6f6f66">Client: Northside  ·  Channel: Paid social  ·  1–30 Sep 2026  ·  Currency: USD</text>
  <text x="48" y="168" font-family="Helvetica,Arial,sans-serif" font-size="14" fill="#8a8a80">Synthetic sample data, drawn for this screenshot. Not a real campaign.</text>
  <line x1="48" y1="196" x2="992" y2="196" stroke="#ddd9cc"/>
  <text x="48" y="228" font-family="Helvetica,Arial,sans-serif" font-size="13" letter-spacing="1" fill="#8a8a80">CREATIVE</text>
  <text x="420" y="228" font-family="Helvetica,Arial,sans-serif" font-size="13" letter-spacing="1" fill="#8a8a80">IMPRESSIONS</text>
  <text x="640" y="228" font-family="Helvetica,Arial,sans-serif" font-size="13" letter-spacing="1" fill="#8a8a80">CLICKS</text>
  <text x="800" y="228" font-family="Helvetica,Arial,sans-serif" font-size="13" letter-spacing="1" fill="#8a8a80">CTR</text>
  <text x="910" y="228" font-family="Helvetica,Arial,sans-serif" font-size="13" letter-spacing="1" fill="#8a8a80">SPEND</text>
  <line x1="48" y1="244" x2="992" y2="244" stroke="#ddd9cc"/>
  <text x="48" y="288" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">Variant A — “Made for the commute”</text>
  <text x="420" y="288" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">412,900</text>
  <text x="640" y="288" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">7,019</text>
  <text x="800" y="288" font-family="Helvetica,Arial,sans-serif" font-size="18" font-weight="600" fill="#23241f">1.70%</text>
  <text x="910" y="288" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">$8,240</text>
  <line x1="48" y1="312" x2="992" y2="312" stroke="#eeebdf"/>
  <rect x="40" y="326" width="960" height="52" rx="6" fill="#fdf3ee"/>
  <text x="48" y="360" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">Variant B — “Now in four colours”</text>
  <text x="420" y="360" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">398,140</text>
  <text x="640" y="360" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">3,583</text>
  <text x="800" y="360" font-family="Helvetica,Arial,sans-serif" font-size="18" font-weight="600" fill="#b83a0c">0.90%</text>
  <text x="910" y="360" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">$7,980</text>
  <line x1="48" y1="394" x2="992" y2="394" stroke="#eeebdf"/>
  <text x="48" y="438" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">Variant C — “Free returns, always”</text>
  <text x="420" y="438" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">201,470</text>
  <text x="640" y="438" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">2,914</text>
  <text x="800" y="438" font-family="Helvetica,Arial,sans-serif" font-size="18" font-weight="600" fill="#23241f">1.45%</text>
  <text x="910" y="438" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#23241f">$4,110</text>
  <line x1="48" y1="472" x2="992" y2="472" stroke="#ddd9cc"/>
  <text x="48" y="514" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="600" fill="#23241f">Total</text>
  <text x="420" y="514" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="600" fill="#23241f">1,012,510</text>
  <text x="640" y="514" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="600" fill="#23241f">13,516</text>
  <text x="800" y="514" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="600" fill="#23241f">1.34%</text>
  <text x="910" y="514" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="600" fill="#23241f">$20,330</text>
  <text x="48" y="562" font-family="Helvetica,Arial,sans-serif" font-size="14" fill="#8a8a80">Filters: all placements · excludes organic · last refreshed 1 Oct 2026</text>
</svg>`;

const CREATIVE = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="600" viewBox="0 0 1040 600">
  <rect width="1040" height="600" fill="#f4f3ee"/>
  <rect x="0" y="0" width="1040" height="54" fill="#e7e5dc"/>
  <circle cx="28" cy="27" r="6" fill="#c9c6ba"/><circle cx="48" cy="27" r="6" fill="#c9c6ba"/><circle cx="68" cy="27" r="6" fill="#c9c6ba"/>
  <text x="120" y="33" font-family="Helvetica,Arial,sans-serif" font-size="15" fill="#6f6f66">Variant B — paid social, 1080×1080</text>
  <rect x="56" y="92" width="452" height="452" rx="10" fill="#2f3a36"/>
  <circle cx="282" cy="250" r="92" fill="#3c4a45"/>
  <rect x="190" y="378" width="184" height="16" rx="8" fill="#55645e"/>
  <text x="120" y="332" font-family="Helvetica,Arial,sans-serif" font-size="34" font-weight="700" fill="#f1f0dd">Now in four colours</text>
  <rect x="190" y="424" width="184" height="46" rx="23" fill="#FF4D0F"/>
  <text x="282" y="454" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="17" font-weight="600" fill="#ffffff">Shop the range</text>
  <text x="556" y="138" font-family="Helvetica,Arial,sans-serif" font-size="26" font-weight="600" fill="#23241f">Variant B</text>
  <text x="556" y="176" font-family="Helvetica,Arial,sans-serif" font-size="17" fill="#6f6f66">Sample creative, drawn for this screenshot.</text>
  <text x="556" y="204" font-family="Helvetica,Arial,sans-serif" font-size="17" fill="#6f6f66">Not a real brand or campaign.</text>
  <line x1="556" y1="236" x2="984" y2="236" stroke="#d8d5ca"/>
  <text x="556" y="276" font-family="Helvetica,Arial,sans-serif" font-size="14" letter-spacing="1" fill="#8a8a80">OPENING LINE</text>
  <text x="556" y="308" font-family="Helvetica,Arial,sans-serif" font-size="19" fill="#23241f">“Now in four colours”</text>
  <text x="556" y="356" font-family="Helvetica,Arial,sans-serif" font-size="14" letter-spacing="1" fill="#8a8a80">FORMAT</text>
  <text x="556" y="388" font-family="Helvetica,Arial,sans-serif" font-size="19" fill="#23241f">Static · 1:1 · paid social</text>
  <text x="556" y="436" font-family="Helvetica,Arial,sans-serif" font-size="14" letter-spacing="1" fill="#8a8a80">IN FLIGHT</text>
  <text x="556" y="468" font-family="Helvetica,Arial,sans-serif" font-size="19" fill="#23241f">1–30 Sep 2026</text>
</svg>`;

const SCREENS = [
  { svg: REPORT, at: '0:22', caption: 'Paid social performance, 1–30 Sep 2026 — sample report' },
  { svg: CREATIVE, at: '0:41', caption: 'Variant B, the creative being discussed — sample asset' },
];

const speech = (id, role, text, at) => ({
  id, sessionId: 'sample', role, speakerLabel: role === 'you' ? 'YOU' : 'SPEAKER',
  text, isFinal: true, tArrived: at, tStart: at / 1000, tEnd: at / 1000 + 4,
});

const EVENTS = [
  speech('s1', 'remote', 'Here is the paid social report for Northside, the first to the thirtieth of September.', 18000),
  speech('s2', 'you', 'Variant B is at nought point nine percent click-through over that period, against one point seven for Variant A.', 30000),
  speech('s3', 'remote', "Okay, let's go with a clearer opening line on Variant B.", 45000),
  speech('s4', 'you', "I'll write the new opening line before Thursday.", 52000),
  speech('s5', 'remote', 'Can you also pull the same report for the display channel?', 60000),
];

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'excerpt-shot-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
        // A narrow window on purpose. The still is shown at about 600px on the home
    // page, so a 1400px-wide capture lands at roughly half scale and its body text
    // stops being readable. Shooting the column narrow keeps the type legible there.
    // Tall as well as narrow: a clip that runs past the viewport bottom comes back
    // with the overflow painted black, so the window has to contain the whole crop.
    '--force-device-scale-factor=2', '--window-size=1080,2400',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'chrome')}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const { send, attach } = await connect();

    // The screens, rasterised first: the document accepts PNG, JPEG or WebP, which
    // is the same rule a person meets, and the tool does not get an exemption.
    const rasterised = [];
    for (const screen of SCREENS) {
      const drawing = await attach(`data:text/html;charset=utf-8,<style>html,body{margin:0}</style>${encodeURIComponent(screen.svg)}`);
      await sleep(1200);
      const shot = await send('Page.captureScreenshot', { format: 'png',
        clip: { x: 0, y: 0, width: 1040, height: 600, scale: 1 } }, drawing);
      rasterised.push({ ...screen, data: shot.data });
    }

    const app = await attach(`${BASE}/`);
    await sleep(2500);
    const run = async (expression, session = app) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
      return result.result.value;
    };

    console.log(await run(seedScript()));
    await send('Page.navigate', { url: `${BASE}/#/m/${MEETING_ID}` }, app);
    await sleep(2500);

    for (const screen of rasterised) {
      console.log(await run(pasteScript(screen.data)));
      await sleep(1200);
      console.log(await run(placeScript(screen.at)));
      await sleep(2000);
      console.log(await run(captionScript(screen.at, screen.caption)));
      await sleep(1000);
    }
    console.log(await run(annotateScript()));
    await sleep(1800);

    // Reload before shooting. Editing leaves an "Undo last structure change"
    // affordance on screen, which is true of the moment and misleading in a still:
    // the picture is of notes being read, not of a half-finished edit. A reload also
    // proves the picture is of what was actually saved, not of unsaved state.
    await send('Page.reload', { ignoreCache: true }, app);
    await sleep(3000);

    // The notes column alone, from the title down to the note written by hand. The
    // sidebar is the library, which is not what the picture is about, and a
    // full-window shot is unreadable at page width.
    const clip = await run(`(() => {
      const main = document.querySelector('.notebook-main');
      const blocks = [...document.querySelectorAll('.writing-block')];
      const first = blocks.find((block) => block.classList.contains('image'));
      const written = blocks.find((block) => block.querySelector('textarea')?.value.startsWith('Agreed:'));
      const box = main.getBoundingClientRect();
      // From the first screen to the note about what was agreed. The document's own
      // header is real but not what the picture is for, and including it halves the
      // scale everything else is read at.
      const top = Math.max(0, first.getBoundingClientRect().top + window.scrollY - 20);
      const bottom = written.getBoundingClientRect().bottom + window.scrollY;
      return { x: Math.round(box.x + 16), y: Math.round(top), width: Math.round(box.width - 32),
               height: Math.round(bottom - top + 10), scale: 1 };
    })()`);
    await sleep(600);

    const shot = await send('Page.captureScreenshot', { format: 'png', clip }, app);
    writeFileSync(join(web, 'public/media/campaign-review.png'), Buffer.from(shot.data, 'base64'));
    console.log('wrote apps/web/public/media/campaign-review.png');

    // The second still: the review tab, where each extracted item carries the
    // verbatim quote it came from. The page claims that; the picture has to show it.
    await run(`(() => { [...document.querySelectorAll('.notebook-tabs button')]
      .find((button) => button.textContent.startsWith('Review')).click(); return 'review'; })()`);
    await sleep(1200);
    // Open the first source, because the sentence beside this picture on the home
    // page is that every item carries the passage it came from.
    await run(`(() => { document.querySelector('.notes-editor details')?.setAttribute('open', ''); return 'opened'; })()`);
    await sleep(600);
    const reviewClip = await run(`(() => {
      const main = document.querySelector('.notebook-main');
      const box = main.getBoundingClientRect();
      const last = [...document.querySelectorAll('.notes-editor blockquote')].pop();
      window.scrollTo(0, 0);
      return { x: Math.round(box.x + 16), y: 0, width: Math.round(box.width - 32),
               height: Math.round(last.getBoundingClientRect().bottom + window.scrollY + 8), scale: 1 };
    })()`);
    await sleep(400);
    const review = await send('Page.captureScreenshot', { format: 'png', clip: reviewClip }, app);
    writeFileSync(join(web, 'public/media/notes.png'), Buffer.from(review.data, 'base64'));
    console.log('wrote apps/web/public/media/notes.png');
  } finally {
    chrome.kill();
    // Chrome is still flushing its profile as it dies; rmdir loses that race.
    await sleep(800);
    try { rmSync(work, { recursive: true, force: true }); } catch { /* a temp dir */ }
  }
}

/** A minimal CDP client. Node has a WebSocket; nothing else is needed. */
async function connect() {
  const version = await poll(async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json());
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });

  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (message) => {
    const payload = JSON.parse(message.data);
    const waiting = pending.get(payload.id);
    if (!waiting) return;
    pending.delete(payload.id);
    if (payload.error) waiting.reject(new Error(payload.error.message));
    else waiting.resolve(payload.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++nextId;
    pending.set(id, { resolve: ok, reject: fail });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const attach = async (url) => {
    const { targetId } = await send('Target.createTarget', { url });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    return sessionId;
  };
  return { send, attach };
}

async function poll(read) {
  for (let i = 0; i < 60; i++) {
    try { return await read(); } catch { await sleep(250); }
  }
  throw new Error('Chrome never answered on the debugging port');
}

/**
 * Written into the meetings store the app reads, with its items extracted by the
 * real engine — imported from source through the dev server, so the excerpts in the
 * picture are the ones `extractItems` actually produces from that speech.
 */
function seedScript() {
  const meeting = {
    id: MEETING_ID,
    title: 'Northside — campaign review',
    startedAt: '2026-10-01T15:00:00.000Z',
    endedAt: '2026-10-01T15:01:12.000Z',
    processing: 'on-device',
    events: EVENTS,
    items: [],
  };
  return `(async () => {
    const core = await import('/@fs${CORE}');
    const meeting = ${JSON.stringify(meeting)};
    meeting.items = core.extractItems(meeting.events, new Date(meeting.startedAt));
    await new Promise((resolve, reject) => {
      // A screenshot profile is a fresh browser, so the store may not exist yet.
      const open = indexedDB.open('excerpt');
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('meetings')) open.result.createObjectStore('meetings');
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction('meetings', 'readwrite');
          tx.objectStore('meetings').put(meeting, meeting.id);
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        } catch (error) { reject(error); }
      };
    });
    return 'seeded ' + meeting.items.length + ' extracted items';
  })()`;
}

/** The design arrives the way a screenshot arrives: pasted into the document. */
function pasteScript(base64) {
  return `(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'checkout-step-2.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.querySelector('.free-document').dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    return 'pasted a screen';
  })()`;
}

const TYPE = `const type = (field, value) => {
  const prototype = field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
  Object.getOwnPropertyDescriptor(prototype.prototype, 'value').set.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
};`;

function placeScript(at) {
  return `(() => {
    ${TYPE}
    type(document.querySelector('.image-placement input'), ${JSON.stringify(at)});
    [...document.querySelectorAll('.image-placement button')]
      .find((button) => button.textContent === 'Add to notes').click();
    return 'placed it on the meeting clock at ' + ${JSON.stringify(at)};
  })()`;
}

/** Caption one placed image, in the field the product provides for it. */
function captionScript(at, caption) {
  return `(() => {
    ${TYPE}
    const block = [...document.querySelectorAll('.writing-block.image')]
      .find((b) => b.querySelector('.moment-time')?.textContent.startsWith(${JSON.stringify(at)}));
    const field = block.querySelector('figcaption input');
    field.focus();
    type(field, ${JSON.stringify(caption)});
    return 'captioned ' + ${JSON.stringify(at)};
  })()`;
}

/**
 * The agreed next action, typed into the product's own field after the creative.
 *
 * A new block rather than an overwritten excerpt: the point of the picture is that
 * a person's own note sits beside the wording that was extracted, not instead of it.
 */
function annotateScript() {
  return `(async () => {
    ${TYPE}
    const images = [...document.querySelectorAll('.writing-block.image')];
    images.at(-1).querySelector('figcaption input').focus();
    await new Promise((resolve) => setTimeout(resolve, 400));
    [...document.querySelectorAll('.writing-toolbar button')]
      .find((button) => button.textContent === '+ Text').click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const blocks = [...document.querySelectorAll('.writing-block')];
    const lastImage = blocks.reduce((found, block, index) => block.classList.contains('image') ? index : found, -1);
    const added = blocks[lastImage + 1];
    type(added.querySelector('textarea'), 'Agreed: test a clearer opening line on Variant B. Brief before Thursday.');
    return 'wrote the agreed next action';
  })()`;
}

await main();
