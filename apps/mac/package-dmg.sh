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
2. Open Excerpt from Applications. macOS says Apple could not verify that
   Excerpt is free of malware. Choose Done (not Move to Trash).
3. Open System Settings > Privacy & Security, scroll to Security, and click
   Open Anyway beside "Excerpt" was blocked to protect your Mac. Confirm
   with your password.
4. Choose your subtitle style and follow the permission and speech-model setup.
5. Use the Excerpt icon in the menu bar to start listening.

Excerpt is locally signed, not notarized by Apple, which is why step 3 is
needed. Right-click > Open no longer skips it on current macOS. More help:
https://excerpt-rho.vercel.app/#/install

To install or update without step 3, paste this into Terminal instead:
curl -fsSL https://excerpt-rho.vercel.app/install.sh | sh

Your notes stay on this Mac. There is no account or subscription.
INSTALL
hdiutil create -volname "Excerpt" -srcfolder "$STAGING/Excerpt" -ov -format UDZO "build/Excerpt.dmg"
hdiutil verify "build/Excerpt.dmg"
echo "Ready: $(pwd)/build/Excerpt.dmg"
