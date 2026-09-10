// Builds the demo meeting used by the landing page's notes screenshot, by running
// the shipped engine bundle over the demo script — the same code path the product
// uses. Nothing in the picture is hand-written output.
//
//   node packages/core/tools/seed-demo-meeting.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { homedir } from 'node:os';

const src = readFileSync(new URL('../../../apps/mac/Resources/excerpt-engine.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(src, ctx);

const ts = readFileSync(new URL('../../../apps/web/src/demo/script.ts', import.meta.url), 'utf8');
const lines = [...ts.matchAll(/\{\s*at:\s*(\d+),\s*role:\s*'(\w+)',\s*speakerLabel:\s*'(\w+)',\s*text:\s*(['"`])([\s\S]*?)\4\s*\}/g)]
  .map((m) => ({ at: Number(m[1]), role: m[2], speakerLabel: m[3], text: m[5] }));

const id = 'm-1788931200000';
const events = lines.map((l, i) => ({
  id: `${id}-e${i + 1}`, sessionId: id, role: l.role, speakerLabel: l.speakerLabel,
  text: l.text, isFinal: true, tArrived: l.at, tStart: l.at / 1000, tEnd: l.at / 1000 + 3.4,
}));

ctx.__e = JSON.stringify(events);
const items = JSON.parse(vm.runInContext('Excerpt.extract(__e, "2026-09-08T09:00:00Z")', ctx));

const meeting = {
  id, title: 'Northside — campaign review',
  startedAt: '2026-09-08T09:00:00Z', endedAt: '2026-09-08T09:01:45Z',
  processing: 'on-device', events, items,
};

const dir = `${homedir()}/Library/Application Support/Excerpt/meetings`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/${id}.json`, JSON.stringify(meeting));
console.log(`${lines.length} lines -> ${items.length} items`);
for (const i of items) console.log(' ', i.category, '|', i.state, '|', i.assignee, '|', i.due ?? '-', '|', i.title);
