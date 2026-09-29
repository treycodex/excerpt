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

## The Terminal installer

`curl -fsSL https://excerpt-rho.vercel.app/install.sh | sh` is the install path that
never meets Gatekeeper: curl does not quarantine what it downloads. The script is
`apps/web/public/install.sh`, deployed with the website and served as plain text by
`vercel.json` so the "Read the script" links show it rather than download it. It
depends on three things a release must keep:

- **The asset URL.** It downloads the same `releases/latest/download/Excerpt.dmg` as
  the Download button, which only works while the repository and its releases are
  public.
- **The disk image layout.** `Excerpt.app` sits at the root of the volume, as
  `package-dmg.sh` builds it.
- **The certificate.** It refuses any app whose signature does not satisfy the
  designated requirement pinned in the script (`certificate leaf = H"2661c9…"`, the
  `Excerpt Dev Local` identity). Recreating that identity with
  `tools/dev-identity.sh` changes the hash; update `REQUIREMENT` in the script in the
  same change, or every Terminal install fails. Check a release with
  `codesign -d -r- build/Excerpt.app`.

## Signing

The app is signed with the local `Excerpt Dev Local` identity, not an Apple Developer
ID, and is not notarized. Gatekeeper therefore blocks the first launch of a
browser-downloaded copy, and people allow it once with **Open Anyway** in System
Settings → Privacy & Security, or install from Terminal instead (the README's Install
section, the DMG's `Read me.txt`, and the website's `#/install` page all say so). Do not describe a build as notarized unless it
has gone through Developer ID signing and notarization.
