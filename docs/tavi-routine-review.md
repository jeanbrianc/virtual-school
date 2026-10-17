# Tavi: What comes next?

Issue #14. Reviewable draft stacked on Nova #40 at `f0469dbf462e6e4f2810186b8ae28f0d8721f684` (chooser #33, main `5e2aaf9`). No merge or deployment is authorized by this patch.

## Complete bounded activity

Tavi is an original teal turtle, registered with local dialogue, portrait and a scene model at (3.6, 5.8). This is outside the dance rug, tables, chalkboard and globe, separated from the existing teachers. Existing routes are unchanged. The additive `routine` activity uses the existing teacher dispatcher and a separate `RoutineFlow`; it does not change the shared multiple-choice lesson runner.

Each run has two short rounds: pack a pretend art box, then apply the idea to a pretend toy bag. The default is two cards. Learner/grown-up controls explicitly offer three or four cards without age or reading assumptions. After two independent valid rounds at the same size, a **Save & try the next size** button appears; nothing promotes automatically and four is the ceiling. Replay creates a fresh ID.

Every task declares a directed precedence graph. Two-card tasks require opening before placing one item; three-card tasks add closing after the item; four-card tasks allow either item first after opening and before closing. The grader checks the graph and complete unique card membership, not equality to a canonical array. Both four-card topological orders are valid. The worked example is just one valid order. There is no judgment about a family's arrangement or habits.

Original SVG illustrations show containers, items, motion arrows and open/closed states. Card labels support screen readers, but reading is not graded. Choose a picture, then choose a position; choosing another position moves the card and swaps already placed cards. Native buttons support touch, pointer, Tab, Enter and Space. No dragging, precise gestures, timing or sound is required. Optional read-aloud is gated on a confirmed local voice and uses the shared `localOnly: true` contract: the helper is bypassed before hashing/cache/network, and the browser stays silent if a verified local voice disappears. No helper/natural-voice option, teacher AI, microphone or recording path is used here. This consumes only the frozen strict-local API subset from safety containment `0d72b0c1a32ea224f779bcd0a64bf76f2a7db8d0`; integration must retain the safety change’s broader recognized-text containment and cache-race fixes.

Feedback stays until the learner presses Continue. Hint shows a visual before/after pair. Model shows a valid picture order. Simpler explicitly abandons the unfinished larger task and restarts that round with two cards; only the smaller actual task can produce evidence. A grown-up-help button marks assistance. Skip, discard-and-replay and close are available. Blur/hidden-tab interruptions pause input and retain the cards until Resume. Reload discards unsaved work; saved work survives.

## Evidence ceiling and compatibility

- `reason.routine-constraints`: arranging two to four pictures under explicit precedence constraints.
- `life.fictional-routine`: planning these fictional art/toy picture routines under the same constraints.
- Both are narrow Family objectives. They describe two views of the same observed trials, not two independent assessments. Legacy `reason.sequencing`, life-skills IDs and evidence remain intact.
- No claims about actual chores, self-care, home routines, family culture, reading comprehension, verbal explanation, or motor proficiency. No external standard is invented.
- Hints, models, invalid submissions/retries, simpler tasks and declared grown-up help mark the solved round supported. Incomplete arrangements do not count as attempts. A skip creates no performance evidence; help/model viewing alone creates none.
- Tap, pointer and keyboard-or-assistive activation are recorded as observed input, separate from correctness and support. A zero-detail click is described as keyboard-or-assistive rather than assuming a physical keyboard.
- Optional reflection offers three fixed descriptive statements and can be omitted. It is never AI graded or turned into mastery evidence. No free-text personal schedules, names, family/location data or recordings are collected.
- Completion uses existing UnitOfWork/finalizeLearning. A child-bound stable run ID plus atomic add guard commits one attempt, narrow evidence, parent summary, mastery and sync changes. Duplicate and concurrent saves return the saved attempt. Failed saves remain retryable; stale callbacks after close cannot save. No schema change or destructive migration.
- No new rewards, currency, subscription, service, or access permission. Existing school reward and world rules remain unchanged.

## Verification

Local `npm run check` passes: 268 tests, typecheck, architecture/privacy lint, production build. Focused routine and registry tests cover deterministic content, all valid topological orders, incomplete/invalid arrangements, move/swap, support/simpler transitions, input equivalence, child-paced feedback, double actions, stale callbacks, retryable saves, memory/IndexedDB concurrency, reload, child scoping, legacy records and sync round-trip.

Local Chromium execution is unavailable because of a previously verified sandbox socket restriction; no local browser pass is claimed. `.github/workflows/tavi-routines.yml` runs the real desktop and Pixel 7 Playwright projects, with reduced motion and unavailable voice APIs. The suite covers 2→3→4 choices, both valid four-card orders, keyboard/tap moves, optional reflection, parent records, repeated saves, reload, child scoping, incorrect/incomplete/support/simpler flows, interruptions, cancellation and existing teacher/globe/dance/keyboard/bookshelf routes. Inherited Nova, chooser and garden suites remain enabled. Hosted desktop and true Pixel 7 passed all six Tavi scenarios on `46ccab43b245e3c66e5ba14bbcbc7bcea8585548`, including an actual canvas click/tap on the model and avatar navigation to its clear approach point. Nova and chooser checks passed on that head. Final strict-local speech follow-up requires fresh exact-head hosted results and screenshot review before approval.

Browser fixtures contain only Sample / Sample sibling / Sample parent, strip birthday and pronunciation fields, and force a document reload after direct IndexedDB writes. They do not connect to production family data or sync services.

## Owner review

1. Find Tavi near the front-right picture-steps corner. Confirm the new character and that the rug, entrance, teachers and globe stay accessible.
2. Start two pictures. Select and place each; move an already placed picture without dragging. Try by keyboard and on a phone.
3. Complete both rounds independently. Accept or ignore the next-size offer. At four cards, try both orders for the middle items.
4. Ask for hint/model/simpler or mark grown-up help. Skip, pause, cancel, replay and reload. Check that unfinished work produces no saved lesson.
5. Save and inspect Teacher talk and learning evidence. Verify size, input, support, skipped rounds, reflection and the limited claim. Review exact-head CI and synthetic screenshots before any merge/deploy decision.
