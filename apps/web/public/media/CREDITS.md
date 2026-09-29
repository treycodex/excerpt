# Landing page imagery

Every image on the home page is a screenshot of Excerpt itself. There is no stock
photography and no mockup.

`campaign-review.png` and `notes.png` are shot from the running app by
`apps/web/tools/render-product-shot.mjs`, which seeds a sample meeting, pastes the
two sample screens through the document's own paste handler, places and captions
them, writes the agreed next action, reloads, and captures the result. Re-run it
whenever the notes view changes.

The report and the creative inside `campaign-review.png` are drawn by that tool —
labelled samples with synthetic figures. No real client, campaign, brand or
reporting data appears anywhere on the site.

The meeting video and its poster are recorded from the product by
`apps/mac/tools/record-media.sh`.

`editorial-hero.jpg` is no longer the home page's hero. It remains in use as the
busy scene behind the subtitle-style previews in Preferences and in the Mac setup,
which is what a subtitle has to stay legible over.
Photograph of Torrey Pines coastline at dusk by Looka Chow.
Source: https://unsplash.com/photos/cliffside-view-of-the-ocean-during-a-sunset-qf1px3mslRE
License: https://unsplash.com/license (free commercial use).

`excerpt-demo.mp4` and its poster `excerpt-demo.jpg` are the demo film behind "Watch
the demo", cut in `apps/demo` (Remotion) and encoded by
`pnpm --filter @excerpt/demo render:web`. Setup, the call prompts, captions, Catch up
and the capture are screen recordings of Excerpt on a Mac (`apps/demo/scripts/rec.sh`).
The part after the call is Excerpt's own editor bundle rendered against the meeting
recorded in that call and driven by `apps/demo/scripts/shoot-stage.mjs`. The meeting
is scripted (`apps/demo/SCRIPT.md`) and voiced with macOS text-to-speech; the company
and dates on the shared slide are fictional. The film says so on screen.
