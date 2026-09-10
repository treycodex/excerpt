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

# Where the call frame sits inside the window, as fractions of it. Resolved against
# the window's real position at record time rather than hardcoded: the window does not
# always land in the same place, and a fixed rectangle records whatever is there.
# The whole call frame, edge to edge. Cropping tighter was tried and does not work:
# the subtitle sits at 84% of the frame by design, so any crop that ends above the
# frame's own border leaves it touching the bottom edge and reading as clipped. The
# frame's border and nameplates are what give it a floor — and the "SCRIPTED DEMO"
# label staying in shot is the honest caption for a screenshot of a scripted demo.
FRAME_LEFT=0.043; FRAME_TOP=0.172; FRAME_WIDTH=0.892; FRAME_HEIGHT=0.685

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

# id x y w h for Excerpt's window — and it exits non-zero if Excerpt is not actually
# the frontmost app, so a run can never quietly photograph something else.
window_geometry() {
  if ! swift tools/window-id.swift "Excerpt"; then
    echo "error: Excerpt's window is not frontmost. Nothing was recorded." >&2
    exit 1
  fi
}

if [ "$WHAT" = all ] || [ "$WHAT" = hero ]; then
  echo "recording the demo session…"
  launch --notes-route "#/session"
  read -r _ WX WY WW WH <<< "$(window_geometry)"
  FRAME=$(awk -v x="$WX" -v y="$WY" -v w="$WW" -v h="$WH" \
    -v l=$FRAME_LEFT -v t=$FRAME_TOP -v fw=$FRAME_WIDTH -v fh=$FRAME_HEIGHT \
    'BEGIN { printf "%d,%d,%d,%d", x + w*l, y + h*t, w*fw, h*fh }')
  screencapture -v -V 26 -x -R "$FRAME" "$WORK/raw.mov"

  # Start on a frame that already has a subtitle in it: autoplay gets refused often
  # enough that the first frame has to work as a poster on its own.
  V="fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2"
  ffmpeg -v error -ss 9.4 -t 16 -i "$WORK/raw.mov" -vf "$V" -an \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 22 -preset slow \
    -movflags +faststart "$MEDIA/meeting.mp4" -y
  ffmpeg -v error -ss 9.4 -t 16 -i "$WORK/raw.mov" -vf "$V" -an \
    -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 "$MEDIA/meeting.webm" -y
  ffmpeg -v error -ss 9.4 -i "$WORK/raw.mov" -frames:v 1 -vf "$V" -q:v 3 \
    "$MEDIA/meeting-poster.jpg" -y
fi

if [ "$WHAT" = all ] || [ "$WHAT" = stills ]; then
  echo "shooting the notes workspace…"
  # The demo meeting is built by running the shipped engine over the demo script,
  # so the notes in the screenshot are extracted rather than written by hand.
  node ../../packages/core/tools/seed-demo-meeting.mjs
  launch --notes m-1788931200000

  # Captured by window id rather than by rectangle: -l gives the window's own rounded
  # corners with transparency behind them, so the shot drops onto the site's dark
  # figure without a rectangle of desktop around it. PNG, because JPEG has no alpha.
  read -r WINDOW_ID _ <<< "$(window_geometry)"
  screencapture -x -o -l "$WINDOW_ID" -t png "$MEDIA/notes.png"
fi

pkill -f "MacOS/Excerpt" 2>/dev/null || true
rm -rf "$WORK"
ls -la "$MEDIA"
