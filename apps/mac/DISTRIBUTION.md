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
an existing bundle cannot be packaged as a stale substitute for current source. To
make a DMG after a signed app build:

```sh
cd apps/mac
./package-dmg.sh
```

The current development identity is not an Apple Developer ID certificate. A public
release requires separate Developer ID signing and notarization; do not represent a
local or ad-hoc preview as a notarized release.
