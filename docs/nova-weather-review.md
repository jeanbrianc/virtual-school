# Nova: Sky picture detectives

Second bounded increment of [issue #21](https://github.com/jeanbrianc/virtual-school/issues/21), stacked only on reviewed [PR #40](https://github.com/jeanbrianc/virtual-school/pull/40) at `f0469dbf462e6e4f2810186b8ae28f0d8721f684`. This does not close the issue or authorize merge/deployment. Sink or Float and Growing and changing remain available; Sink or Float remains Nova's default.

## Learning design and content review · 2026-10-17

Primary source inspected: [NGSS K.Weather and Climate](https://www.nextgenscience.org/topic-arrangement/kweather-and-climate). Its K-ESS2-1 material supports qualitative descriptions, small whole-number counts, and media-based observations as part of noticing patterns over time. The direct [K-ESS2-1 page](https://www.nextgenscience.org/pe/k-ess2-1-earths-systems) returned a fetch error during this review; the official topic page supplied the same performance expectation, clarification/assessment boundaries, practice and ESS2.D content. No proprietary lesson text, questions or images were copied. Wording and schematic SVG symbols are original.

Four child-paced rounds offer two explicit levels:

- Level 1 matches a schematic picture and label to the same symbol. Targets are seeded selections from four symbols: sun with no clouds drawn; clouds with no rain drawn; falling rain; falling snow. Each round has two distinct, large picture choices. This is picture matching, not proof of real weather observation.
- Level 2 compares an explicitly **made-up** three- or four-day chart. One symbol occurs twice or three times; the other occurs once. Questions ask which symbol occurs more often or more than once. No ties or overlapping acceptable answers. Target identity, choice order, distractors and chart order vary deterministically by seed; targets may repeat within a run.

Rain can occur with clouds. Accordingly the dry-cloud symbol is labeled "Clouds, no rain drawn", never a competing generic "cloudy" answer for a rain picture. Each symbol depicts only the drawn detail: no inference about temperature, time of day, seasons, climate, a cause of rain/snow, or future conditions is requested. A made-up chart cannot establish a local weather pattern or forecast tomorrow. A future real-world observation suggestion is optional, descriptive, offscreen and ungraded; look safely through a window with a grown-up, without looking directly at the sun.

## Evidence ceiling and support

Only `sci.weather-picture-match` and `sci.weather-chart-compare` are emitted. The former is Family-aligned picture-and-label matching. The latter is partial K-ESS2-1 practice with fictional media records, **not full standard mastery**. No generic observation, prediction, explanation, seasonal-weather or life-cycle skills are attached. Reading advancement never chooses the level. There is no automatic difficulty promotion.

Independent means correct without in-attempt help; a wrong attempt, hint or model makes later success supported. Merely viewing a picture/model produces no performance evidence. Skip produces no science-skill evidence. The completion screen names the ceiling and offers gentle review or another explicit level. Aquarium rewards remain visit celebrations, not proficiency claims. The existing service may record persistence after supported success; it never labels that as science mastery.

## Interaction, privacy and persistence

- Tap, click or Tab/Enter chooses pictures; no drag, microphone, location, external API, AI or network is required after the app loads. Labels and optional fixed-content local narration provide equivalent prompts. Without speech, pictures remain usable and a grown-up can read the short comparison prompt when needed. A full nonvisual lesson or independent comprehension of the chart question without language support is outside this increment.
- The weather flow never mounts chat or handles free text. It only narrates authored prompt/feedback content. The strict `localOnly` speech contract is the small verified API patch also used by Tavi PR #44: helper speech bypasses the provider/cache path; browser speech requires a verified local voice and otherwise remains silent. Broader safety PR #46 must retain its additional containment checks when integrated.
- Answers and feedback stay until Next picture. Repeat events are version-guarded; blur cancels narration. Close/restart/unmount invalidates stale callbacks. Unfinished close or level switches explicitly confirm discard. A completed run saves before finish/replay/level switch, and save failures retain the completed run for retry. No in-progress save permits another action.
- Each WeatherRun has a fresh run ID and immutable starting child ID. The weather save entry point rejects unknown or mismatched children, then uses the existing atomic add/idempotent save. No schema migration, service, credentials or deployment changes. Existing evidence and unlock records are not relabeled.

## Verification status

Final checks and exact-head hosted browser results are reported in the draft PR. Local Chromium is blocked by the environment's socket sandbox; no local browser pass is claimed. The PR-only, contents-read workflow runs `npm run check` plus focused desktop and real Pixel 7 Playwright projects, with synthetic screenshots/traces, no secrets and no deployment. Synthetic profile setup is copied byte-for-byte from the canonical Hoot fixture and runs after optional-capability mocks, followed by its forced reload and Sample assertion.

Unit coverage includes deterministic/unique content, both levels, scoped mapping/source references, support/retry/skip, stale actions, repeated controls, cancellation, save failures, child rejection, atomic rollback, duplicate saves, IndexedDB reopen, sync repeated delivery, and unchanged old evidence/unlocks. Browser coverage includes both levels, actual phone taps/desktop keyboard, hints/model/retry, skip, blur, close/reopen, replay/level switches, unavailable audio, offline completion, reload, child scope, old-lab navigation and viewport geometry. Hosted screenshots are synthetic review evidence, not usability testing with children.

## Owner acceptance

1. Open Nova's chooser and select Sky picture detectives. Confirm both prior Nova labs remain available.
2. Try both levels on desktop and phone. Inspect the drawn distinctions, explicit made-up chart labels and one-answer questions.
3. Try repeated hints, a model, wrong answer, skip, close, Keep playing, discard and a level switch. Finished work must save before another run; incomplete work should not add science evidence.
4. Finish, replay and reload; inspect the selected child's narrow evidence and the sibling's unchanged records. Read the ceiling/next-step text and review synthetic screenshots and exact-head checks before approving a merge or deployment.
