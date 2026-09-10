#!/bin/bash
# Assembles a real .app bundle. A bare executable cannot carry the usage strings
# TCC needs, and screen-recording permission is keyed to a bundle identity.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG=${1:-debug}

# The caption presets are generated from the web token file. Catch drift here rather
# than discovering it as two products that disagree about what "Warm" means.
if command -v node >/dev/null 2>&1; then
  node tools/sync-caption-tokens.mjs --check
else
  echo "warning: node not found; skipping the caption-token sync check"
fi

swift build -c "$CONFIG" 2>&1 | tail -20

APP="build/Excerpt.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp ".build/$CONFIG/Excerpt" "$APP/Contents/MacOS/Excerpt"
cp Resources/Info.plist "$APP/Contents/Info.plist"

# The app icon. Generated from the [ e ] mark by apps/web/tools/render-brand.mjs;
# without it macOS draws a blank generic document next to Excerpt in the Microphone
# and Screen Recording panes, which is a poor look for an app asking for both.
if [ -f Resources/AppIcon.icns ]; then
  cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
else
  echo "warning: Resources/AppIcon.icns missing — run: node ../web/tools/render-brand.mjs"
fi

# The extraction engine is the web package's build output, not a Swift port. If it
# is missing the app has no notes at all, so refuse to assemble a bundle without it.
if [ ! -f Resources/excerpt-engine.js ]; then
  echo "error: Resources/excerpt-engine.js missing — run: pnpm --filter @excerpt/core build:engine"
  exit 1
fi
cp Resources/excerpt-engine.js "$APP/Contents/Resources/excerpt-engine.js"

# The notes editor is the web app's own build output. Same reasoning as the engine:
# a missing one means an app with no notes in it, so fail rather than ship it.
if [ ! -f Resources/notes/index.html ]; then
  echo "error: Resources/notes missing — run: pnpm --filter @excerpt/web build:notes"
  exit 1
fi
rm -rf "$APP/Contents/Resources/notes"
cp -R Resources/notes "$APP/Contents/Resources/notes"

# TCC keys permissions to code identity. Ad-hoc signing (-s -) produces a new hash
# every build, so macOS treats each build as a different app and drops every grant —
# measured, not assumed: gate 14 saw microphone and speech fall back to undetermined
# and screen recording stay denied after a rebuild.
#
# A locally created self-signed identity keeps the identity stable across rebuilds.
# It is NOT an Apple-issued certificate and does nothing for Gatekeeper; it only
# stops the permission churn. See tools/dev-identity.sh to recreate it.
IDENTITY=${EXCERPT_IDENTITY:-"Excerpt Dev Local"}
if security find-identity -v -p codesigning | grep -q "$IDENTITY"; then
  codesign --force --sign "$IDENTITY" --timestamp=none "$APP" 2>&1 | tail -2 || true
else
  echo "warning: '$IDENTITY' not found; falling back to ad-hoc (permissions will reset every build)"
  codesign --force --sign - --timestamp=none "$APP" 2>&1 | tail -2 || true
fi

echo "built: $APP"
