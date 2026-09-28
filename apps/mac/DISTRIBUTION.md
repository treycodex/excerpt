# Excerpt desktop distribution

Excerpt is a macOS application. The bundled editor is local and is not a standalone
website or browser-capture product.

## Build a local app or DMG

From the repository root:

```sh
pnpm build:engine
pnpm build:editor
pnpm build:mac
```

`build:mac` regenerates the engine and editor resources before assembling the app, so
an existing bundle cannot be packaged as a stale substitute for current source. It
makes a debug build; a DMG for anyone else must come from a release build:

```sh
cd apps/mac
./build.sh release
./package-dmg.sh
```

## Publish a release

The website and README link to
`https://github.com/treycodex/excerpt/releases/latest/download/Excerpt.dmg`, so the
asset must keep the name `Excerpt.dmg` and the release must be marked latest:

```sh
gh release create vX.Y --title "Excerpt X.Y" --notes-file notes.md apps/mac/build/Excerpt.dmg
```

Raise `CFBundleShortVersionString` in `Resources/Info.plist` to match the tag first.

## Signing

The app is signed with the local `Excerpt Dev Local` identity, not an Apple Developer
ID, and is not notarized. Gatekeeper therefore blocks the first launch of a downloaded
copy, and people allow it once with **Open Anyway** in System Settings → Privacy &
Security (the README's "The app is unsigned" section, the DMG's `Read me.txt`, and the
website's Install section all say so). Do not describe a build as notarized unless it
has gone through Developer ID signing and notarization.
