# Combined backlog and safety validation

## Current scope: eight reviewed candidates

This validation-only draft PR supersedes the seven-only candidate
`9ad50ea9459268bb37fac23dc3ee5829babb118a` (tree
`4c53018be6e4f73d339816945473ba871cbd298e`) with exactly that candidate plus
reviewed safety-containment PR #46 at
`57e5df3245104cb9627a1bae7cf912c8285f83c6` (tree
`998447ad892e6b8429732c1b1499c918c1ab04f4`). Public merge parents preserve both
source histories. The recorded main base remains
`5e2aaf9dfff174501a07c6d5a028a10b68fed33f`.

The original seven source heads remain:

- #34 globe: `0354cc1835771447a7999e33d8958b24228ce4da`
- #38 phone camera: `464aab9456377fd2019641d5a0d61f09f3bacad0`
- #33 activity chooser: `0b1cf0a88ede5186777b80442bbd8582af062a1d`
- #35 Hoot stories: `327fadfa982ffcb345cef0e23aca2641506652b9`
- #36 usage visibility: `15a2869a0671bc514f21eef50e93b298b35c729d`
- #40 Nova life-cycle: `f0469dbf462e6e4f2810186b8ae28f0d8721f684`
- #37 place-value math: `a59ec0d95e92b9b7efd27012b62cd269be60376a`

Docs #39, Pippa #41, avatar deletion #43, Tavi #44, Milo #45, privacy copy #47
and weather #48 are excluded. This PR does not close their broader issues.

## Integration boundary

The combined source was independently reviewed at local tree
`f953bacbb9fdc9d4101d100cd2f07d5d23592a0d`. Runtime changes are precisely the
seven-feature candidate plus PR #46. Hoot retains AI attribution together with
local-only transcript markers and guarded speech. LessonFlow retains its
lifecycle guards and safety markers. Full-history/privacy latches, strict-local
speech, raw-text checks before hashing/cache access, and queued digest/cache
cancellation guards are preserved. Phone test registration is additive.

After that source review, only this evidence document and the batch workflow's
additional safety-containment suite changed. The PR body records the exact
published head and resulting whole-tree SHA; every batch job logs both again.

## Exact-head browser gate

The PR-only workflow retains all 13 existing suites and adds safety-containment:

`globe`, `activity-chooser`, `teacher-registry`, `story-conversations`,
`core-loop`, `hoot-mobile`, `usage-parent`, `helper-voice`,
`batch-voice-fallback`, `book-arrival`, `nova-life-cycle`, `reading-nook`,
`base-ten`, `safety-containment`.

Each runs under both desktop and the actual Pixel 7 Playwright project:
14 suites × 2 devices = 28 jobs. The dedicated batch config does not filter
phone suites. Each job first proves nonzero test discovery, then runs the
selected journey against the exact PR head. The workflow has contents-read
permission, no deployment job and no secrets.

Fixtures use synthetic Sample profiles, mocked helper responses and fake audio.
The safety journey retains its outbound request assertions and persists the
mocked-request JSON alongside the successful screenshot artifact. No live
provider call or real learner record is needed.

Local checks passed on the combined source: strict typecheck, architecture and
format lint, all 317 unit/component tests and production build. Local Chromium
binding is unavailable, so local browser execution is not claimed. The new
28-job hosted run is pending at publication; the PR body and linked run provide current status.
No earlier run is accepted as a pass for this expanded tree.

## Preserved historical evidence

The seven-only final run [39040057638](https://github.com/jeanbrianc/virtual-school/actions/runs/39040057638)
passed 26 jobs / 48 browser tests at head `9ad50ea9459268bb37fac23dc3ee5829babb118a`.
Its screenshots and independent review remain evidence for that predecessor,
not the new combined safety tree. The earlier seven-head harness-failure run
[39038174015](https://github.com/jeanbrianc/virtual-school/actions/runs/39038174015)
and six-head incomplete run remain historical, not passes for the current scope.

## Release approval remains separate

This is an unmerged draft validation candidate. Publishing this branch and
running CI does not authorize merging main or deploying. An approved atomic
release must recheck the exact candidate, unchanged main base and final combined
checks/artifacts. Sequential merging of source PRs can deploy intermediate
unvalidated trees under the existing main workflow and is not equivalent.
