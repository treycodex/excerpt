#!/bin/bash
# Render background.html into the disk image's 1x and 2x background images. Run after
# editing the HTML and commit the PNGs, so packaging a release never needs Chrome.
set -euo pipefail
cd "$(dirname "$0")"
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
for scale in 1 2; do
  out=$([ "$scale" = 1 ] && echo background.png || echo background@2x.png)
  "$CHROME" --headless --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --window-size=920,520 --force-device-scale-factor="$scale" \
    --screenshot="$(pwd)/$out" "file://$(pwd)/background.html" 2>/dev/null
  echo "wrote $out ($(sips -g pixelWidth -g pixelHeight "$out" | awk '/pixel/{printf "%s ", $2}'))"
done
