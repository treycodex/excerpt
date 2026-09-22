#!/bin/bash
# Assembles a real .app bundle. A bare executable cannot carry the usage strings
# TCC needs, and screen-recording permission is keyed to a bundle identity.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG=${1:-debug}
BUILD_ROOT=${SWIFT_SCRATCH_PATH:-.build}
IDENTITY=${EXCERPT_IDENTITY:-"Excerpt Dev Local"}

# Decide before compiling or replacing the last good app. A sandboxed terminal may
# be unable to read the login Keychain even when the identity exists; that build must
# stop here and be rerun with Keychain access, not leave an unsigned bundle behind.
if security find-identity -v -p codesigning | grep -q "$IDENTITY"; then
  SIGNER="$IDENTITY"
elif [ "${EXCERPT_ALLOW_ADHOC:-0}" = "1" ]; then
  echo "warning: '$IDENTITY' not found; EXCERPT_ALLOW_ADHOC=1 permits a permission-resetting build"
  SIGNER="-"
else
  echo "error: '$IDENTITY' is unavailable. Refusing to ad-hoc sign because that resets macOS permissions."
  echo "run: ./tools/dev-identity.sh"
  echo "or explicitly allow a disposable build with: EXCERPT_ALLOW_ADHOC=1 ./build.sh"
  exit 1
fi

# The caption presets are generated from the web token file. Catch drift here rather
# than discovering it as two products that disagree about what "Warm" means.
if command -v node >/dev/null 2>&1; then
  node tools/sync-caption-tokens.mjs --check
else
  echo "warning: node not found; skipping the caption-token sync check"
fi

# These resources are generated inputs, not cached prerequisites. Rebuild both on
# every native package invocation so an existing `Resources/notes` directory can
# never silently package editor or engine code from an older source tree.
if command -v pnpm >/dev/null 2>&1; then
  pnpm --dir ../.. --filter @excerpt/core build:engine
  pnpm --dir ../.. --filter @excerpt/editor build:notes
else
  echo "error: pnpm is required to build fresh engine and editor resources"
  exit 1
fi

if [ "$BUILD_ROOT" = ".build" ]; then
  swift build --disable-sandbox -c "$CONFIG" 2>&1 | tail -20
else
  swift build --disable-sandbox -c "$CONFIG" --scratch-path "$BUILD_ROOT" 2>&1 | tail -20
fi

APP="build/Excerpt.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BUILD_ROOT/$CONFIG/Excerpt" "$APP/Contents/MacOS/Excerpt"
cp Resources/Info.plist "$APP/Contents/Info.plist"

# The app icon. Generated from the [ e ] mark by apps/editor/tools/render-brand.mjs;
# without it macOS draws a blank generic document next to Excerpt in the Microphone
# and Screen Recording panes, which is a poor look for an app asking for both.
if [ -f Resources/AppIcon.icns ]; then
  cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
else
  echo "warning: Resources/AppIcon.icns missing — run: node ../editor/tools/render-brand.mjs"
fi

# The extraction engine is the shared package's build output, not a Swift port. If it
# is missing the app has no notes at all, so refuse to assemble a bundle without it.
if [ ! -f Resources/excerpt-engine.js ]; then
  echo "error: Resources/excerpt-engine.js missing — run: pnpm --filter @excerpt/core build:engine"
  exit 1
fi
cp Resources/excerpt-engine.js "$APP/Contents/Resources/excerpt-engine.js"

# The notes editor is the bundled editor's build output. Same reasoning as the engine:
# a missing one means an app with no notes in it, so fail rather than ship it.
if [ ! -f Resources/notes/index.html ]; then
  echo "error: Resources/notes missing — run: pnpm --filter @excerpt/editor build:notes"
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
codesign --force --sign "$SIGNER" --timestamp=none "$APP" 2>&1 | tail -2

echo "built: $APP"
