#!/bin/bash
# Re-shoots the landing page's footage and stills from the product itself.
#
# There is no stock footage in this project and there is not going to be: the hero
# is a screen recording of the demo session with its own captions running, and the
# stills are the real notes view and the real setup. That means they can go out of
# date, so this exists to re-shoot them in one command rather than leaving a stale
# picture of a product that has moved on.
#
#   ./tools/record-media.sh          re-shoot everything
#   ./tools/record-media.sh hero     just the hero footage
set -euo pipefail
cd "$(dirname "$0")/.."

APP="build/Excerpt.app"
MEDIA="../web/public/media"
WORK=$(mktemp -d)
WHAT=${1:-all}

# The notes window is 1040x760 at the top-left of the main display. It is a real
# browser window with no chrome to crop out, which is why the shots come from there
# rather than from a browser with a toolbar in the way.
WINDOW="0,258,1040,760"
# The call frame inside it. Excludes the transport and the "scripted demo" chrome.
FRAME="50,393,900,506"

[ -d "$APP" ] || { echo "build the app first: ./build.sh"; exit 1; }

park_pointer() {
  # screencapture records the cursor. Park it in a corner rather than leaving an
  # arrow floating in the middle of the hero.
  cat > "$WORK/warp.swift" <<'SWIFT'
import CoreGraphics
CGWarpMouseCursorPosition(CGPoint(x: 1690, y: 1090))
CGAssociateMouseAndMouseCursorPosition(1)
SWIFT
  swift "$WORK/warp.swift"
}

launch() {
  pkill -f "MacOS/Excerpt" 2>/dev/null || true
  sleep 1.5
  # Always through LaunchServices: a direct exec attributes permissions to the
  # terminal instead of to the app.
  open "$APP" --args "$@" || { sleep 1; open "$APP" --args "$@"; }
  sleep 4
  park_pointer
}

if [ "$WHAT" = all ] || [ "$WHAT" = hero ]; then
  echo "recording the demo session…"
  launch --notes-route "#/session"
  screencapture -v -V 26 -x -R "$FRAME" "$WORK/raw.mov"

  # Start on a frame that already has a subtitle in it: autoplay gets refused often
  # enough that the first frame has to work as a poster on its own.
  V="crop=1800:870:0:75,fps=30"
  ffmpeg -v error -ss 9.4 -t 16 -i "$WORK/raw.mov" -vf "$V" -an \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 22 -preset slow \
    -movflags +faststart "$MEDIA/meeting.mp4" -y
  ffmpeg -v error -ss 9.4 -t 16 -i "$WORK/raw.mov" -vf "$V" -an \
    -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 "$MEDIA/meeting.webm" -y
  ffmpeg -v error -ss 9.4 -i "$WORK/raw.mov" -frames:v 1 -vf "$V" -q:v 3 \
    "$MEDIA/meeting-poster.jpg" -y
fi

if [ "$WHAT" = all ] || [ "$WHAT" = stills ]; then
  echo "shooting the notes view…"
  # The demo meeting is built by running the shipped engine over the demo script,
  # so the notes in the screenshot are extracted rather than written by hand.
  node ../../packages/core/tools/seed-demo-meeting.mjs
  launch --notes m-1788931200000
  screencapture -x -R "$WINDOW" -t png "$WORK/notes.png"
  ffmpeg -v error -i "$WORK/notes.png" -vf "crop=2080:1360:0:80,scale=1200:-2" -q:v 4 \
    "$MEDIA/notes.jpg" -y

  echo "shooting the setup…"
  launch --setup-step ready
  screencapture -x -R "495,129,720,620" -t png "$WORK/setup.png"
  ffmpeg -v error -i "$WORK/setup.png" -vf "scale=1100:-2" -q:v 4 "$MEDIA/menubar.jpg" -y
fi

pkill -f "MacOS/Excerpt" 2>/dev/null || true
rm -rf "$WORK"
ls -la "$MEDIA"
