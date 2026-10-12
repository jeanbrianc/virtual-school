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

`npm run check` passed: TypeScript, repository lint/formatting, all **219 unit
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
