# Pippa pattern progression: first increment of issue #23

## Review scope and dependencies

This is a draft, unmerged first increment of [issue #23](https://github.com/jeanbrianc/virtual-school/issues/23). It stacks on the immutable Nova life-cycle draft `f0469dbf462e6e4f2810186b8ae28f0d8721f684`, which includes the shared activity chooser. It does not close #23. No merge or deployment is authorized by this change.

Pippa's existing default `patterns-shapes` lesson remains unchanged: two matching or optional AB rounds, followed by a descriptive free shape choice. Its IDs, saved attempts and observations are preserved. The optional chooser adds **Pattern playground**, with explicit matching, AB, AAB, ABB and ABC choices. No reading level, other subject proficiency, age or existing broad AB evidence selects a harder starting level.

## Original content and ceiling

- Four rounds per selected level. Matching shows each of the three outlines over the run. Pattern rounds vary the shape mapping and the displayed prefix length deterministically for a seed.
- AB uses two different shapes; AAB repeats the first, ABB repeats the second, ABC uses three different shapes. There are exactly two distinct choices for matching and three for continuation, with one valid answer.
- Each pattern shows at least two complete repeating groups. Groups are visibly marked, and a partial group plus the next-shape slot makes the continuation task explicit. This is continuation **with a visible grouped model**, not independent discovery of an unknown rule.
- Original circle, triangle and square SVGs provide geometric cues beyond color. Choices have visible labels, accessible names, keyboard activation, focus rings and large touch targets. No drag precision, audio, microphone or AI is required.
- Hints identify the group; the optional worked model explains and marks the next shape. Hints, wrong-answer support and model viewing make subsequent success supported. Viewing alone creates no performance evidence. Skip creates no correctness trials.
- Successful/modelled feedback waits for **Next round**. There is no timer or automatic difficulty promotion. Repeated Next/Skip and stale-run callbacks are guarded.
- **Start over with matching** clearly abandons an unfinished run without saving it. Close also leaves unfinished performance unsaved. Completed replay, choose-level and matching switches save once before beginning another run; write failure keeps the completed run available for retry.

These are family-defined skills, not claims that a curriculum standard is fully met:

| New evidence ID | Assessed task |
| --- | --- |
| `reason.pattern-continue-ab` | Choose one next shape in a visible grouped AB pattern |
| `reason.pattern-continue-aab` | Choose one next shape in a visible grouped AAB pattern |
| `reason.pattern-continue-abb` | Choose one next shape in a visible grouped ABB pattern |
| `reason.pattern-continue-abc` | Choose one next shape in a visible grouped ABC pattern |

Matching reuses `reason.shape-match`. The older `reason.visual-patterns` ID and its historical description are retained; old evidence is not copied into these new skills. This activity does **not** assess copying, explaining/describing the rule, generalizing to non-shape patterns or artistic quality. Parent scope notes are collapsible at completion.

## Persistence, rewards and storage

The normal lesson service stores one attempt and child-scoped evidence by stable run identity. Atomic duplicate saves, reload and repeated sync use the existing storage protocol. There are no schema changes, destructive migrations, media, credentials, permissions, analytics or paid services.

Pattern completion increments lesson participation only. It creates **no portfolio artwork** and no artwork reward credit. Legacy free designs remain descriptive observations with zero correctness trials. Different new runs are legitimate replays; repeated saves of one run remain one record.

## Verification

- Full `npm run check`: typecheck, architecture/privacy lint, formatting, unit tests and production build.
- New domain tests: all five levels across 60 seeds; deterministic varied examples; answer uniqueness; repeated-unit validity; narrow skill mappings; hint/model/retry/skip semantics; legacy design and IDs; memory/IndexedDB saves and reopen; sibling scoping; no artwork counts; duplicate saves and remote-sync replay.
- New React tests: advanced incoming start tier cannot override matching choice; explicit challenge choice; child-paced feedback; double Next/Skip; stale callbacks; cancel/close; in-play matching restart; completed matching/replay/choose-level saves; retry after save failure; unavailable voice/AI.
- Hosted Playwright: separate Desktop Chrome and real Pixel 7 emulation projects, keyboard versus touch activation, all five levels, models, skip, blur/close/reopen, matching restart, replay, old novice/AB/free-design flow, offline participation, duplicate-save actions, reload and sibling checks. Synthetic Sample/Sample sibling profiles only, with birth dates and spoken names removed. Direct IndexedDB fixture writes are followed by a page reload. Actions are bounded to 30 seconds; game/camera readiness is explicit. Failure traces/screenshots and successful review screenshots are uploaded.
- Inherited Nova, chooser and garden workflows also run because shared lesson/UI files changed. Local browser execution is unavailable because sandbox socket binding is denied; no reinstall or escalation is attempted. Hosted evidence must pass on the final immutable head before readiness.

## Owner acceptance

1. Open Pippa. Start the original Shape Studio and confirm matching and a free design still feel welcoming.
2. Choose an activity → Pattern playground. Select each challenge deliberately, inspect its repeating shapes and use a hint/model.
3. Confirm Next waits for the child; Start over with matching clearly restarts without recording unfinished challenge work.
4. Finish a run; replay or choose another level. In the parent view, confirm the narrow continuation skill, supported trial when a model was used, and no artwork entry.
5. Inspect desktop and Pixel 7 screenshots for legibility, comfortable touch targets and no clipped controls. Confirm wording/content is appropriate for the learner.

## Still open in #23

The offline drawing/composition canvas, undo/redo, clear confirmation, explicit artwork save, keyboard/tap drawing alternatives, thumbnail export, media/storage compatibility, and exactly-once artwork rewards are deliberately absent. They need their own storage-compatible design review and separate implementation. Copying and rule-description assessment likewise require tasks that actually demonstrate those skills; this increment makes no such claim.
