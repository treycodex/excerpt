#!/bin/sh
# Installs the latest Excerpt release into Applications, or updates it.
#
#   curl -fsSL https://excerpt-rho.vercel.app/install.sh | sh
#
# A browser marks what it downloads for Gatekeeper, and Excerpt is not notarized, so
# a browser download is stopped the first time it opens. curl does not mark files,
# so an app installed this way opens straight away. Nothing here changes a security
# setting. In place of Apple's check, this script checks the app's signature against
# the certificate every Excerpt release is signed with, and installs nothing else.
#
# Everything runs from `main` on the last line, so a download cut off partway through
# runs nothing at all.

set -eu

DMG_URL="https://github.com/treycodex/excerpt/releases/latest/download/Excerpt.dmg"

# The designated requirement of every release: the bundle identifier, signed by the
# "Excerpt Dev Local" certificate (apps/mac/tools/dev-identity.sh). Recreating that
# certificate changes this hash, and this line has to change with it.
REQUIREMENT='identifier "com.excerpt.app" and certificate leaf = H"2661c93db91337e0e49f87012c3cdd560259fa8f"'

say() { printf '%s\n' "$*"; }
fail() { printf 'Excerpt was not installed: %s\n' "$*" >&2; exit 1; }

main() {
  [ "$(uname -s)" = Darwin ] || fail "Excerpt is a Mac app."
  # hw.optional.arm64 rather than `uname -m`: a Terminal running under Rosetta
  # reports x86_64 on an Apple silicon Mac.
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] \
    || fail "Excerpt needs a Mac with Apple silicon."
  version=$(sw_vers -productVersion)
  [ "${version%%.*}" -ge 26 ] \
    || fail "Excerpt needs macOS 26 or later. This Mac has macOS $version."

  # Admin accounts can write to /Applications without sudo; anyone else gets their own.
  if [ -w /Applications ]; then dir=/Applications; else dir="$HOME/Applications"; mkdir -p "$dir"; fi
  app="$dir/Excerpt.app"

  # Never quit it on anyone's behalf: a running Excerpt may be in the middle of a meeting.
  if pgrep -qf "$app/Contents/MacOS/Excerpt"; then
    fail "Excerpt is running. Quit it from the menu bar, then run this again."
  fi

  tmp=$(mktemp -d "${TMPDIR:-/tmp}/excerpt-install.XXXXXX")
  volume="$tmp/volume"
  trap 'hdiutil detach "$volume" -quiet >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  trap 'exit 130' INT TERM

  say "Downloading Excerpt…"
  curl -fL --progress-bar -o "$tmp/Excerpt.dmg" "$DMG_URL" \
    || fail "the download did not complete."

  mkdir "$volume"
  hdiutil attach "$tmp/Excerpt.dmg" -nobrowse -readonly -noautoopen -mountpoint "$volume" -quiet \
    || fail "the disk image could not be opened."
  [ -d "$volume/Excerpt.app" ] || fail "the disk image does not contain Excerpt.app."
  codesign --verify --deep --strict -R "=$REQUIREMENT" "$volume/Excerpt.app" 2>/dev/null \
    || fail "the downloaded app is not signed with Excerpt's certificate."

  say "Installing into $dir…"
  # Copied beside the old app first, so a copy that fails leaves the installed one working.
  staged="$dir/.Excerpt.app.installing"
  rm -rf "$staged"
  ditto "$volume/Excerpt.app" "$staged"
  rm -rf "$app"
  mv "$staged" "$app"

  say "Excerpt is installed in $dir. Opening it…"
  open "$app"
}

main "$@"
