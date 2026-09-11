# Editable notes and meeting captures

Implemented in the existing web editor and native Mac app, preserving legacy
meeting documents and the user's previous working-tree changes.

## Verified

- Web production build and TypeScript check.
- 104 core tests, including nine new cases for screenshot placement, empty meetings,
  import ordering, repeated corrections, corrected deadlines, protected user edits,
  deletion persistence, and escaped portable HTML export.
- 86 Swift tests, including native screenshot checkpoint recovery without a transcript
  and round-tripping document blocks, images, and correction history.
- Browser journey: demo → editable notes → add heading and paragraph → import PNG
  at 0:30 → edit caption → reload. Text and image placement persisted.
- Browser journey: confirm decision → correct Thursday to Monday in transcript →
  preview affected notes → apply. Generated note changed and the deadline became
  2026-09-14 for the test meeting; the screenshot remained in place.

## Remaining hands-on checks

- In a real Mac meeting, invoke Cmd+Shift+J over a fullscreen call and return to live.
- Invoke Cmd+Shift+S, select a region, and finish the meeting. Confirm the image is
  beside the relevant discussion and its time matches the capture.
- Paste/drop an image into the native catch-up panel. Confirm it survives stopping
  and reopening the meeting.
- Exercise screenshot cancellation and shortcut conflicts with other installed apps.

No claim of live end-to-end capture validation is made by the compile/unit checks.

## Catch-up UI refinement

- Compact dark panel, grouped speakers, muted timestamps, 30/60/90-second controls,
  close button, and a pinned Return to live / Escape button.
- Browser panel supports pointer dragging and arrow-key movement; position is saved
  locally and clamped to the viewport. Mac panel remembers its frame and opens above
  the lower-right caption area by default.
- Live transcript updates preserve reading position. Browser verification measured
  scrollTop staying at 29.5 while transcript height grew from 794 to 1045; the new
  conversation indicator appeared. Escape closed the panel, and reopening retained
  the moved x/y position. The scripted demo now exposes catch-up for inspection.
- Screenshot guidance appears only during a drag; successful imports get a brief
  confirmation in the footer.
- Swift tests cover stable speaker groups as text is appended and lookback targets
  within a long speaker turn. 88 Swift tests pass after the catch-up changes.
