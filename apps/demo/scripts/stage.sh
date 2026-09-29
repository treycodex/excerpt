#!/bin/bash
# Sets the stage for the demo shoot: moves Excerpt's real library aside so the film
# shows a clean app, and asks for the first-run setup again. Nothing is deleted and
# no permission is touched. restore.sh puts everything back.
set -euo pipefail

LIB="$HOME/Library/Application Support/Excerpt"
BACKUPS="$HOME/Library/Application Support/Excerpt-demo-backups"
DOMAIN=com.excerpt.app

if pgrep -f "Excerpt.app/Contents/MacOS/Excerpt" >/dev/null; then
  echo "error: quit Excerpt first (menu bar → Quit Excerpt)"; exit 1
fi
if [ -L "$BACKUPS/current" ]; then
  echo "error: already staged ($(readlink "$BACKUPS/current")). Run restore.sh first."; exit 1
fi

dir="$BACKUPS/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dir"
defaults export "$DOMAIN" "$dir/defaults.plist"
count=$(find "$LIB/meetings" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
echo "$count" > "$dir/meeting-count"
if [ -d "$LIB" ]; then mv "$LIB" "$dir/Excerpt"; fi
ln -s "$dir" "$BACKUPS/current"

# Only the setup flag: the microphone choice and caption style stay as they were.
defaults write "$DOMAIN" setup.completed -bool false

echo "staged: $count meetings moved to $dir"
echo "restore with: $(dirname "$0")/restore.sh"
