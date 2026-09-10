# Mac download and onboarding

The landing page's free-start buttons open `#/get-started`:

- Mac: a DMG download when `VITE_MAC_DOWNLOAD_URL` is configured; otherwise an honest source-build link.
- Browser: `#/setup` for subtitle style and optional note priorities, then `#/record` for audio setup.
- Demo: `#/session`; first-time users see personalization before their saved demo notes.

The native app opens setup automatically on first launch. Setup covers subtitle style,
microphone/system-audio/speech permissions, Apple's on-device speech model, and menu-bar usage.
Returning users can reopen setup from the Excerpt menu.

## Build a DMG

From the repository root:

```sh
pnpm --filter @excerpt/core build:engine
pnpm --filter @excerpt/web build:notes
cd apps/mac
./build.sh release
./package-dmg.sh
```

The output is `apps/mac/build/Excerpt.dmg`. The disk image includes Excerpt, an
Applications shortcut, and installation instructions. Packaging verifies the app
signature and the disk image but does not notarize or publish either.

## Publish the download

The current signing identity is local development signing. A smooth public install
requires an Apple Developer ID signature and notarization; a DMG alone does not
remove Gatekeeper warnings. The preview package explicitly states this limitation.

After preparing the intended signed/notarized build, publish the DMG as a GitHub
Release asset (or another stable HTTPS download). Set `VITE_MAC_DOWNLOAD_URL` in the
web deployment environment to the actual asset URL, then rebuild/deploy the website.
The Mac card will show **Download for Mac**. No guessed release URL is shipped.

Do not commit generated DMGs or app bundles. The build directory is ignored.
