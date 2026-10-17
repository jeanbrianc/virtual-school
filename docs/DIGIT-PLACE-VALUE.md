# Digit place value: optional 20–99 challenge (issue 20, slice 2)

## Exact learning boundary

Moon Rock Rescue remains the default route, with all seven tiers and every historical ID unchanged. Its ceiling is still equal groups totalling at most 20. The optional “Tens and ones mission” is reached through the shared pre-lesson chooser. It does not grow the moon rocket or use mission completion as mathematics mastery.

Three new reviewed objective IDs describe only the represented tasks:

- `math.tens-ones-20-99`: identify tens and ones in numbers 20–99 with a labeled base-ten representation.
- `math.compose-20-99`: compose 20–99 from displayed tens and ones.
- `math.decompose-20-99`: choose the tens-and-ones decomposition of 20–99.

All tasks retain a base-ten representation. “Independent” means correct on the first attempt without an additional hint, smaller example, retry, or worked answer; it does not claim abstract calculation or transfer without representations. Existing broad catalog skill `math.place-value` is not silently credited or replaced.

## Teaching sequence and entry

A concrete model introduces one bundled ten and three loose ones. The child is invited to build the same example with straws or blocks. Each mission then presents five distinct, deterministic seeded examples at one selected objective, with a readable ten-bundle/one representation, a child attempt, specific place-value feedback, and a new example. Incorrect answers offer a hint, then a smaller worked example; three unsuccessful choices show the worked answer. Hint, smaller example and worked model are also explicit buttons. Zero extra ones is explained rather than omitted. There are no timers or penalties.

Entry depends on math evidence, never age, reading level, mission count or rocket appearance. Without proficient count-to-20 evidence, the default is a clearly labeled optional review/exploration; a parent can choose a new-learning goal after the existing PIN gate. Otherwise the suggestion is the first new objective not yet proficient. A flagged goal suggests optional review. Parents can choose the goal and learning/review purpose for a session. This is session-scoped, not a hidden persistent placement.

There is no within-session jump to harder material. New-learning proficiency retains the existing evidence rule: at least three independent successes over at least two days and recent score at least 0.7. Mastery requires at least six across three days, score at least 0.85 and a three-trial independent streak. At the new ceiling, the mission suggests optional review; it does not unlock unimplemented arithmetic.

## Evidence, retention and persistence

Each finished round saves atomically against its exact objective. A first-try answer is independent, a hint/smaller example/retry is supported, a worked answer is not yet, and a skip is saved distinctly with no performance evidence. Pending saves disable repeat answers. Failed saves retain a retryable immutable payload, so storage failure cannot turn an independent response into a supported one. Repeated/stale calls do not duplicate or overwrite saved rounds. One revision guard protects concurrent local writers. Session, child, goal, purpose and already-saved rounds cannot be changed.

Optional review retains dated independent/supported/not-yet/skipped observations in the attempt and parent teacher-talk summary, separately from new-learning performance evidence. It does not advance new-skill mastery. A later review with varied examples can be inspected for retention; no automatic retention claim is made merely from revisiting. The parent can choose “new learning” when they want the goal reassessed using the existing cross-day evidence rules.

Close/reload keeps completed saved rounds and marks a partial mission incomplete. The unfinished on-screen question is not saved; reopening starts a new session. Replay is explicitly review with a new seed. Exactly-once IDs apply to local repeated writes, not a redesign of family sync: attempts/evidence use existing synchronized tables and retain existing cross-device conflict semantics. No schema migration or external service is needed.

## Verification and acceptance

Domain/service tests exhaustively sample 3,000 deterministic examples, unique answers/ranges, complete explanations, prerequisites, ceiling, support classification, skip exclusions, child scoping, atomic failures/retries, concurrent and stale saves, reload, existing sync transport and unchanged rocket growth. A component regression checks failed-save retry, repeated answers and repeated Next activation. Browser tests cover desktop and phone touch/keyboard, explicit parent entry, offline unavailable helper, hints/smaller/model/skip, blur, close/reopen/replay, portrait/narrow landscape, and reload. Exact commands and final-head CI results belong in the PR; unrun browser tests are not a pass.

Owner acceptance: inspect the synthetic screenshots and try a goal with real bundles. Check that goal selection fits the learner's math baseline; review the exact objective/support report and a varied example on a later day. This is a bounded instructional design, not evidence that app-only learning improves outcomes for a specific young child.

Remaining issue 20 scope: two-digit addition/subtraction within 100 without regrouping, then explicit supported regrouping, each in a later verified increment. Larger multiplication/division, fractions, numbers above 99 and abstract transfer assessment are follow-on candidates only. No merge or production deployment is authorized by this PR.
