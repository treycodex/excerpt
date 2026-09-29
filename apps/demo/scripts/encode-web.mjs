#!/usr/bin/env node
// Encodes the rendered film for the website: a streamable 1080p H.264 (moov first,
// ~2.2 Mbps, silent: the narration is subtitles) and a poster from the title card.
//   pnpm --filter @excerpt/demo render && pnpm --filter @excerpt/demo render:web
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const src = 'out/excerpt-demo.mp4';
const media = '../web/public/media';
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:v', 'libx264', '-preset', 'slow', '-b:v', '2.2M',
  '-maxrate', '3M', '-bufsize', '5M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${media}/excerpt-demo.mp4`]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2.6', '-i', src, '-frames:v', '1', '-q:v', '3', `${media}/excerpt-demo.jpg`]);
const mb = (f) => (statSync(f).size / 1e6).toFixed(1);
console.log(`web: excerpt-demo.mp4 ${mb(`${media}/excerpt-demo.mp4`)} MB, poster ${mb(`${media}/excerpt-demo.jpg`)} MB`);
