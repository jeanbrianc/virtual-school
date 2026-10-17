# Destination book arrivals (#32)

The arrival camera now derives its focus from the book's permanent slot, including
third/grand cases and floor overflow stacks. Normal shelf selection, reading
records, rewards and navigation are unchanged. Desktop retains the same camera
angle/distance and flight from Hoot, translated to the destination. On narrow or
portrait screens the book pops into view in front of its destination and follows
a shorter arc, with conservative room for its enlarged/spinning bounds below the
HUD. Resizing an active arrival recomputes its framing.

A newer arrival, teacher/alphabet shot, camera release or disposal cancels the old
arrival. Interrupted book flights settle into the saved slot, and duplicate IDs
reuse their mesh. World refresh cancels older book tweens before positioning the
current records. Overflow now settles in the same rotated pose used on reload.
No persistence, service, reward or child-UI changes are included.

## Automated evidence

- `tests/unit/book-arrival.test.ts` reproduces the old off-screen third-case shot
  at 320px. It checks target identity and projected bounds at indices 0, 9, 10,
  24, 25, 31, 49, 50, 59, 99, 100, 107, 108 and 140; 320/375/412px portrait and
  667x375 / 740x320 landscape; repeated IDs, interruption, reload transforms,
  overflow orientation and newer-shot ownership. Geometry tests do not claim
  rendered-pixel evidence.
- `tests/e2e/book-arrival.spec.ts` uses synthetic Sample records created through
  the normal completion service. Desktop and phone runs assert actual rendered
  book bounds, unobscured DOM hit targets and a clear 3D sightline to the book.
  They attach real flight/landing screenshots for the third, grand and overflow
  destinations. A real 25-to-26 UI completion covers Home, Back/Forward, reload,
  a second completion and shelf detail selection, preserving existing IDs.
- Screenshot capture briefly pauses the tween clock at an actual pop frame; it
  does not move the camera, move the book, hide the HUD or alter the scene. Normal
  rendering continues. The clock is restored before the arrival continues.
- `.github/workflows/book-arrival.yml` checks out the exact PR head, runs
  `npm run check`, installs Chromium and runs both browser projects. Permissions
  are only `contents: read`; checkout credentials are not persisted. Artifacts
  include the candidate SHA and expire after seven days. No deploy job or
  production/AI/sync credentials are used.

Run locally with:

    npm run check
    npm run test:e2e -- tests/e2e/book-arrival.spec.ts --project=desktop
    npm run test:e2e -- tests/e2e/book-arrival.spec.ts --project=phone

The initial local aggregate check passed all 247 tests, typecheck, lint and the
production build. This environment has no Playwright-managed Chromium runtime;
local browser results are not represented as passes. Browser status and reviewed
pixel artifacts must be verified on the exact final PR head before approval.
