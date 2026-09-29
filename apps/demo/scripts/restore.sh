#!/bin/bash
# Undoes stage.sh: the real library and settings come back exactly as they were. The
# library recorded for the demo is kept beside the backup, not deleted.
set -euo pipefail

LIB="$HOME/Library/Application Support/Excerpt"
BACKUPS="$HOME/Library/Application Support/Excerpt-demo-backups"
DOMAIN=com.excerpt.app

if pgrep -f "Excerpt.app/Contents/MacOS/Excerpt" >/dev/null; then
  echo "error: quit Excerpt first (menu bar → Quit Excerpt)"; exit 1
fi
[ -L "$BACKUPS/current" ] || { echo "nothing staged"; exit 0; }
dir=$(readlink "$BACKUPS/current")

if [ -d "$LIB" ]; then mv "$LIB" "$dir/demo-library"; fi
if [ -d "$dir/Excerpt" ]; then mv "$dir/Excerpt" "$LIB"; fi
defaults import "$DOMAIN" "$dir/defaults.plist"

want=$(cat "$dir/meeting-count")
have=$(find "$LIB/meetings" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
if [ "$want" != "$have" ]; then
  echo "error: expected $want meetings back, found $have. Backup left at $dir"; exit 1
fi
rm "$BACKUPS/current"
echo "restored: $have meetings, settings from $dir/defaults.plist"
