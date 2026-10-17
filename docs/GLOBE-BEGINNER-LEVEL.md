# Three-shape state adventures

This increment addresses the requested easier globe entry in issue #19. Opening
the globe starts Level 1 directly: “Which state is Florida?” and three large state
outlines. There is no countdown, unlocking rule or reading-based placement.

## Content and teaching boundary

- Eight introductory states: Florida, Texas, California, Michigan, Ohio, Alaska,
  Hawaii and Louisiana. Each adventure has five distinct targets; Florida is the
  welcoming first target and button positions/distractors vary. Each prompt has
  exactly one correct outline and two distinct other states.
- State geometry is the existing generated Natural Earth public-domain asset.
  Each outline keeps its orientation and aspect ratio, scaled to its own card.
  Separate scales help recognition; they do not compare geographic size. Existing
  Alaska/Hawaii geometry retains its documented map projection limitations.
- A wrong choice identifies that state and invites another try. Optional names,
  a highlighted model, skipped prompts and retries are saved honestly as support
  or skipped observations. Screen-reader users can reveal the labeled choices;
  this supported alternative does not imply independent silhouette recognition.
- The question can be replayed through the existing consent-controlled speech
  service, including after feedback. Text and keyboard/tap choices work without
  audio or AI. Labels, borders and words supplement color.
- “Choose another level or map” offers the full 50-state US map as Level 2, the
  beginner shapes again, and the existing harder eleven-country map. Levels are
  choices, not claims of mastery. Completed work never forces harder content.

## Compatibility and records

Stable `globe-states`, `globe-countries` and `nova` IDs are unchanged. New beginner
observations use `geography.state-shapes`; the original full-map objective remains
`geography.states`. Existing records are not migrated or regraded. New full-map
rounds have tier 1, and new silhouette rounds tier 0; old full-map tier-0 records
remain full-map observations identified by their unchanged objective.

Each cumulative round retains the existing atomic session/revision persistence.
Changing maps starts a new session; already saved rounds remain, and partial
sessions do not count as completed adventures. Retry after a storage failure
retains the round identity. There are no new mastery awards or reward thresholds.
The parent summary distinguishes three-choice recognition from full-map practice.

## Acceptance evidence

Unit/component coverage checks deterministic target/choice identity, varied
correct positions, valid card view boxes, beginner default, explicit full-map and
countries routes, question replay, label support, skipped/independent outcomes,
five-round saves, repeated activation, replay identity and storage-failure retry.
Existing geography/persistence tests cover old IDs and simultaneous tab saves.

Browser coverage in `tests/e2e/globe.spec.ts` checks original full-map behavior,
country routing, cancellation/exposure, concurrent saves and the beginner flow
at 320/375/412 portrait and narrow landscape, with synthetic screenshots and
keyboard/touch input. Actual pass/fail/not-run results and exact CI head belong in
the PR. Adding a test is not evidence that its browser run passed.

Owner approval and independent review remain required before merge/deployment.
No production learner data or billable provider calls are used in tests.
