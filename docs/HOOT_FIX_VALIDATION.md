# Professor Hoot book-progress and mobile response fixes

Validated locally on October 12, 2026. Publication is held for parent confirmation.

## Source and diagnosis

Remote main was cloned into this task's isolated checkout at
`ac8e41ee1b7aaa7c52c4f0c384b0f521888d81ea` (merged PR 28). Read-only inspection of
`/Users/brian.jean/Projects/izzys-classroom` confirmed its older local history and
preserved unrelated dirty work; that checkout was not modified. No AGENTS.md or
`.agents/skills` was present in the isolated repository or original checkout.
README/package scripts supplied the validation workflow. Local memory summary
and matching project memory supplemented history; no session files or secrets
were read.

The finished-book prompt treated absence of active/queued books as proof of a
first book. Completed history was ignored. The initial greeting also captured
its first render permanently. Rating advanced via a delayed callback whose
closure could save an earlier rating, and repeated taps created multiple timers.
Five fixed 84px targets plus gaps could overflow a narrow dialogue.

## Behavior

- First-book copy depends on actual completed-book records. Returning readers
  get another-book copy. Loading/unavailable history gets neutral copy. The
  current ChildMode only mounts Hoot after records load; its global error/loading
  screens remain authoritative. Hoot also accepts explicit history status for
  callers that display a conversation while history is unknown.
- Emoji feeling replies have hidden visible labels, retained accessible names,
  equal targets, a selected check, and explicit Next/Not sure options.
- Numbered star buttons select the same 1–5 values; Next confirms, Not now omits
  a rating. Selection stays visible and can be changed before confirmation.
- Favorite-part quick replies remain book-specific; an explicit skip, optional
  typed favorite part, and existing voice input remain available.
- Back resets the draft. Close/unmount cancels timers. Immediate ref guards
  prevent repeated completion/answer taps before React renders. The selected
  rating is read directly when preparing the persisted completion.

## Validation

`npm run check` passed: TypeScript, repository lint/formatting, all **233 unit
tests**, and production build. `git diff --check` passed. New unit coverage
checks completed history versus unknown history and stored 1–5/omitted ratings.
All testing used synthetic fixtures; no production learner writes or billable
voice calls were made.

The existing first-day browser test was updated for explicit Next. New mobile
browser cases cover a 320px viewport, accessible emoji selections, target bounds,
no microphone permissions, typed title, back/reset, rapid confirmation, saved
rating, returning copy after reload, close during pending save, repeated opens,
and skip routes. These cases are **unverified**, not passing.

Browser attempts: the initial local server needed sandbox escalation; after
escalation the default Playwright Chromium was missing. A temporary runtime
install stalled/incompletely extracted (missing Chromium Framework); it was
stopped. Installed Chrome did not reach test execution and the runner was
stopped. The supported UI tool independently failed at startup with a sandbox
configuration error (`unbound variable: TIOCSTI`). No successful browser
screenshots are available. Browser checks should run in a working environment
before publication:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- --project=desktop tests/e2e/hoot-mobile.spec.ts tests/e2e/core-loop.spec.ts
```

UX choices for review: emoji-only treatment is scoped to feeling responses;
book titles and book-specific comprehension/favorite replies retain necessary
text. Feeling and rating now require Next to allow correction before continuing.


## Independent-review cancellation correction

The independent review of `2ca3fe13eba908446a15c43943462974e9413ba2`
identified two real gaps in the original cancellation claim: deferred favorite
microphone callbacks could resurrect a canceled draft, and deferred start/progress
callbacks could replace the reset menu. Both were corrected in the follow-up.

Every Hoot step transition invalidates the previous operation generation,
clears scheduled work, and stops microphone listening. Back and Close also reset
the conversational topic, notes, pending status, and live title/trouble state.
Unmount invalidates all outstanding callbacks. Deferred chat, start, progress,
and microphone callbacks check their generation before logging, speaking,
changing the current UI, or preparing a completion. Microphone cleanup also
blocks an obsolete preparation from starting a listener after its view is removed.
Dispatched start/progress persistence cannot be rolled back by Back; Back cancels
the presentation/draft and discards obsolete replies, while an already dispatched
write may still complete. Transcripts passed to those writes are snapshots.

`tests/unit/hoot-cancellation.test.ts` mounts the actual React components with
`react-test-renderer`, synthetic deferred services/microphones, and mocked timers.
The suite runs without a DOM/browser, network, or voice service; only cover canvas
and reduced-motion environment surfaces are stubbed. All **14 regression checks**
pass, including stale favorite callbacks after Back/Close/unmount, captured callbacks
against a replacement draft, stale start/progress/chat replies, microphone
preparation, scheduled saves, and legitimate current-session start/chat/favorite
responses, plus retry after a current chat failure. Running the original 13 cancellation checks on an isolated copy of the previous commit
produced **9 failures and 4 passes**, demonstrating the regressions are detected.

Final aggregate checks pass with **233 tests**, TypeScript, repository lint,
production build, and diff checks. The E2E bundle also builds. Browser cases remain
unrun/blocked as recorded above; no new browser success or screenshots are claimed.
The renderer is a pinned development-only dependency and emits its upstream
React deprecation notice; tests use real hooks/lifecycles, not a custom hook driver.

Reproduce the component checks with:

```sh
node --import tsx --test tests/unit/hoot-cancellation.test.ts
npm run check
```
