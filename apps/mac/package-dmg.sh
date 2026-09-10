#!/bin/bash
# Package an already-built app for distribution. This does not notarize or publish it.
set -euo pipefail
cd "$(dirname "$0")"
APP="build/Excerpt.app"
if [ ! -d "$APP" ]; then
  echo "Build the app first: ./build.sh release"
  exit 1
fi
codesign --verify --deep --strict "$APP"
STAGING=$(mktemp -d "${TMPDIR:-/tmp}/excerpt-dmg.XXXXXX")
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/Excerpt"
ditto "$APP" "$STAGING/Excerpt/Excerpt.app"
ln -s /Applications "$STAGING/Excerpt/Applications"
cat > "$STAGING/Excerpt/Read me.txt" <<'INSTALL'
EXCERPT — FREE, OPEN-SOURCE MEETING NOTES

Requires Apple silicon and macOS 26 or later.

1. Drag Excerpt into Applications.
2. Open Excerpt from Applications.
3. Choose your subtitle style and follow the permission and speech-model setup.
4. Use the Excerpt icon in the menu bar to start listening.

This preview build is locally signed, not Apple-notarized. macOS may block first
launch. See the installation guide before proceeding:
https://github.com/treycodex/excerpt#the-app-is-unsigned

Your notes stay on this Mac. There is no account or subscription.
INSTALL
hdiutil create -volname "Excerpt" -srcfolder "$STAGING/Excerpt" -ov -format UDZO "build/Excerpt.dmg"
hdiutil verify "build/Excerpt.dmg"
echo "Ready: $(pwd)/build/Excerpt.dmg"
