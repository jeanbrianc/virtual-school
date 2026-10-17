# Base-ten Workshop: two-digit answer choices without regrouping

Issue #20, next bounded increment after the reviewed place-value PR #37. Stacked separately; not part of release candidate #42. Nothing in this increment authorizes merge or deployment.

## Boundary and entry

Digit's shared chooser adds one optional Base-ten Workshop. Moon Rock Rescue remains the default with the original seven tiers and historical IDs unchanged. The place-value lesson, its progress and its IDs remain unchanged.

A parent enters the existing PIN gate and explicitly chooses one of two challenges:

- Add within 100: four addition items.
- Add and subtract within 100: addition, subtraction, addition, subtraction.

Both operands are two-digit numbers, every sum/difference is 0–99, and no item requires trading/regrouping. This deliberate small ceiling is a subset of “within 100”; making 100 by exchanging tens is not introduced. Subtraction is nonnegative. The mission never advances to a harder level automatically.

Readiness suggestions use earlier tens/ones, composition, decomposition and smaller addition evidence; mixed practice additionally checks smaller subtraction. They never use age, advanced reading, mission count or rocket completion. A parent can choose exploration regardless of recorded prerequisites: these are suggestions, not locks or grade placement. The default practice purpose is review, and there is no child-facing default start before a parent chooses. At the current ceiling the parent is invited to fresh-item review, with no hard unlock or unimplemented next level.

## Teaching and observed evidence

The introduction models 23 + 14 = 37 and 46 − 12 = 34 for the mixed challenge with readable, original base-ten bundle/unit graphics. A fresh attempt displays its two operands and a question mark; it does not print a result or result decomposition in visible text or accessible labels. After the parent chooses, the child-controlled model sequence precedes the fresh items. Three large answer buttons are the only assessed action. Introductory and smaller-model answer values are excluded from all assessed targets. Four seeded targets have distinct answers and unique bounded distractors from varied nearby-count, tens-error and combined-digit-error families, avoiding a fixed numerical-rank or digit-intersection shortcut.

Each attempt provides specific feedback. A wrong response offers an item hint; a second wrong response offers a smaller worked example; a third shows the worked result. Hint, smaller example, worked answer and skip are also explicit choices. The child controls the pace, can close the mission, and can replay fresh-item review after completion. There are no timers or penalties.

The exact new skills are family-defined observations, not full external-standard or algorithm claims:

- `math.add-100-no-regroup-answer`: choose the sum of two two-digit operands without regrouping, with base-ten operand representations.
- `math.subtract-100-no-regroup-answer`: choose the difference under the same conditions.

A correct first answer on a fresh, unhinted item is independent arithmetic-answer evidence within this represented multiple-choice task. A hint, smaller model or retry makes the answer supported. Viewing the current item’s worked answer before making any answer attempt is a distinct ungraded model-only observation, with no performance evidence or mastery trial. An unsuccessful answer followed by the worked model remains not yet independent. Skips have no performance evidence. Choosing an answer does not observe manipulation, decomposition, regrouping, a particular algorithm or abstract transfer. These limitations are in parent copy and saved statements. Existing place-value or broad arithmetic skills are not credited by this task.

Review stores dated observations separately and does not advance new-skill mastery. New-learning mode uses the existing cross-day evidence thresholds only for the narrow answer-choice skill. Four same-session correct answers never establish proficiency. Fresh-item replay is not described as delayed retention. A parent may revisit on another day and inspect the actual evidence; no retention conclusion is automatically inferred from returning.

Off-screen practice: tie ten straws into each bundle, show a worked joining/taking-away example, then offer different numbers. Let the child move the bundles and loose units and explain what happened. Those actions need separate parent observation; the app does not claim to have seen them.

## Persistence and privacy

Each finished round uses the existing atomic UnitOfWork with deterministic evidence IDs, an append-only child-scoped arithmetic revision guard and immutable saved round identity. Duplicate/concurrent/stale saves cannot erase or double-credit rounds. The run belongs to one child. Failed saves retain the exact response/support payload for retry. Closing/reloading preserves completed rounds only; reopening starts a new run. Completed rounds use existing family sync transport without a schema migration, new recipient or new service. This guard serializes arithmetic sessions for the same child; it does not redesign concurrent writes from other learning services or cross-device sync conflict handling. The mission does not grow the Moon Rock Rescue rocket.

This increment has no speech or microphone controls and makes no AI/provider calls. It runs offline from an already-loaded app shell without voice availability. Cold offline startup or offline site reload is not claimed or tested. Visual/text prompts can be read with adult support as needed. Optional speech, if added later, must use a strictly local, reviewed path; the existing general teacher speech path is not reused here.

## Verification and owner acceptance

Run `npm run check`, the focused `base-ten-arithmetic` unit/flow tests and the `Two-digit arithmetic review` workflow. The focused suite covers 4,000 deterministic targets, bounds, no regrouping, distinct choices/answers, model exclusion, readiness, evidence categories, exact-once save/failure/retry, child isolation, unchanged rocket growth, review separation and existing sync transport. Component tests inspect the answer-free first state, parent selection, repeated activation, support transitions and replay.

Browser CI runs actual desktop Chromium and Pixel 7 projects, with isolated Sample profiles lacking birth dates and pronunciation aliases. It covers keyboard/touch answers, offline/provider absence, cancel, hint/smaller/worked/skip, blur, reload, review, exact parent-record association after reload, narrow landscape and the unchanged place-value/shared-chooser regressions. Inspect final-head screenshots and CI, rather than treating a local browser launch denial as a pass. The PR records exact head/tree and any repaired failures.

Owner acceptance: try both choices with a suitable math baseline; inspect the initial and supported states; confirm parent records describe answer choice only; build fresh examples with real objects and revisit later if useful. This implementation does not demonstrate app-only educational outcomes for a young child.

Remaining #20 scope: separately reviewed supported regrouping. Larger multiplication/division, fractions, numbers above this ceiling and abstract-transfer assessment are candidates only. Do not close the broad issue for this slice.
