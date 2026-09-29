#!/usr/bin/env node
// Copies the meeting recorded for the demo out of Excerpt's (staged) library, with its
// screenshots inlined, so the stage can render the real editor against it.
//   node scripts/export-meeting.mjs [meeting-id]   → footage/stage-meeting.json
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const lib = join(homedir(), 'Library/Application Support/Excerpt');
const files = readdirSync(join(lib, 'meetings')).filter((f) => f.endsWith('.json'));
const id = process.argv[2] ?? files.map((f) => f.replace(/\.json$/, '')).sort().at(-1);
const meeting = JSON.parse(readFileSync(join(lib, 'meetings', `${id}.json`), 'utf8'));
for (const image of meeting.images ?? []) {
  const ref = /^excerpt-asset:v1:([0-9a-f]+)$/.exec(image.dataUrl ?? '');
  if (ref) image.dataUrl = readFileSync(join(lib, 'meeting-assets', id, `${ref[1]}.txt`), 'utf8').trim();
}
mkdirSync('footage', { recursive: true });
writeFileSync('footage/stage-meeting.json', JSON.stringify(meeting));
console.log(`exported ${meeting.title} (${id}): ${meeting.events.length} lines, ${meeting.images?.length ?? 0} images`);
