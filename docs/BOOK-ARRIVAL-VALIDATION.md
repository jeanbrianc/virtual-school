# Destination book arrivals (#32)

The arrival camera now derives its focus from the book's permanent slot, including
third/grand cases and floor overflow stacks. Normal shelf selection, reading
records, rewards and navigation are unchanged. Desktop retains the flight from Hoot and the familiar angle for earlier cases;
the grand shelf is framed head-on to keep its ladder out of the book sightline. On narrow or
portrait screens the book pops into view in front of its destination and follows
a shorter arc, with conservative room for its enlarged/spinning bounds below the
HUD. A temporary camera near-plane cutaway removes foreground teachers/furniture
while keeping all book corners visible; after landing it isolates the destination
slot. Normal clipping is restored on release, any later shot, or disposal.
Resizing an active arrival recomputes both its framing and remaining flight path,
without replacing the completion promise.

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
  overflow orientation, newer-shot ownership and desktop-to-phone resize during
  the pan and flight. A full-world scan checks all slots 0–140 against teachers,
  furniture and the grand ladder on all five phone sizes and desktop, including
  bounce-corner near-plane clipping. Geometry tests do not claim
  rendered-pixel evidence.
- `tests/e2e/book-arrival.spec.ts` uses synthetic Sample records created through
  the normal completion service. Desktop and phone runs assert actual rendered
  book bounds, unobscured DOM hit targets and a clear 3D sightline to the book.
  They attach real flight/landing screenshots for the third, grand and overflow
  destinations, including later rows previously hidden behind Hoot and the ladder. A real 25-to-26 UI completion covers Home, Back/Forward, reload,
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

The final local aggregate check passed all 250 tests, typecheck, lint and the
production build. This environment has no Playwright-managed Chromium runtime;
the installed system Chromium also fails before test execution on sandbox-denied
Unix sockets. Local browser results are not represented as passes. Browser status and reviewed
pixel artifacts must be verified on the exact final PR head before approval.
