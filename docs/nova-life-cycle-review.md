# Nova: Growing and changing

First bounded increment of [issue #21](https://github.com/jeanbrianc/virtual-school/issues/21), stacked on the shared teacher activity chooser in PR #33 (base `0b1cf0a88ede5186777b80442bbd8582af062a1d`). Weather remains a separate increment. No deployment or merge is part of this change.

## What this release does

- Nova keeps Sink or Float as the default and offers Growing and changing in the shared chooser.
- Four short rounds alternate flowering-plant and butterfly pictures. The learner explicitly selects **Notice & match** (two picture choices) or **What comes next?** (three choices). Levels never change automatically.
- Seeded generation varies stages and choice order. Every run visits earlier and later stages from both organisms, with no repeated target picture within a run.
- Original SVG illustrations and labels support tap, pointer, Tab/Enter and screen-reader choices. A pictured arrow and empty next slot support sequencing without dragging. Reading aloud is optional; the loop does not require audio, microphone, location, AI or network access after the app loads.
- Answer feedback stays until the learner presses **Next picture**, allowing time to read or listen.
- Hint and full worked model are available during each attempt. Viewing either marks that attempt supported; viewing alone creates no performance evidence. Skip creates no skill evidence. Closing unfinished work creates no lesson attempt. Completed replay saves before starting a fresh run.
- Uses existing IndexedDB/sync schema and idempotent lesson saves. No migration or service is added. Existing Sink or Float evidence, routes, rewards and unlock rules remain intact.

## Content review, 2026-10-17

Facts were checked against these primary educational/scientific sources. All wording and vector drawings in the activity are original; no source images or proprietary questions were copied.

1. [Royal Botanic Gardens, Kew: What is a seed?](https://www.kew.org/read-and-watch/what-is-a-seed). Supports seed structure, germination under suitable conditions, and flowering-plant seeds being enclosed in fruits.
2. [Royal Botanic Gardens, Kew: Plant reproduction](https://www.kew.org/kew-gardens/school-visits/browse-sessions/key-stage-3/plant-reproduction). Supports flowering-plant reproduction involving pollination, fertilization, seed and fruit formation and dispersal.
3. [Smithsonian National Museum of Natural History: Butterflies and Beyond](https://naturalhistory.si.edu/education/teaching-resources/life-science/butterflies-and-beyond). Supports egg-laying, caterpillar/larval growth, pupa-to-adult transformation and the next generation.
4. [NGSS: 3-LS1-1 / LS1.B](https://www.nextgenscience.org/pe/3-ls1-1-molecules-organisms-structures-and-processes). Introductory sequencing connects to growth and development. This activity does **not** establish the full modeling expectation.

### Deliberate simplifications and ambiguity checks

- Flowering plant: seed → seedling → flowering plant → fruit with seeds. This is a schematic sequence, not a species-identification guide, a timescale or a claim that every seed survives or every flower makes fruit. Flower-to-fruit wording explicitly includes pollination and fertilization; real processes and intermediate growth are compressed.
- Butterfly: egg → caterpillar (larva) → chrysalis (pupa) → adult butterfly. No claim that a chrysalis is an egg or that a caterpillar is an adult butterfly. No universal lifespan, color or host-plant claims.
- Cycle closure explicitly introduces **new plants** from seeds and **a new generation** from eggs. An adult does not turn back into an egg; the old plant does not turn back into a seed.
- Each question has one answer in the stated four-picture model. Same-organism distractors avoid conflating plant and animal stages. Challenge visuals show only the current stage and a question slot, never the answer or complete sequence before support is requested.
- Models show a simplified reproductive cycle; survival, death, plant needs, species diversity and complete causal explanations are beyond the current ceiling.

## Evidence ceiling

`sci.life-picture-match` records matching a life-cycle picture and its printed label. It does not claim real-world observation or biological explanation. `sci.life-next-stage` records choosing the next stage in two small picture models. Neither maps to generic predicting, explaining, materials or full life-cycle mastery. No `alsoSkills` are attached. No prediction is solicited or scored in this increment.

The matching level uses a narrow Family alignment. Sequencing cites LS1.B only as introductory practice, explicitly short of 3-LS1-1. Independent means answered without in-attempt support; answers after a hint, failed attempt or worked model remain supported. Skips do not increase mastery. A picture model alone provides no evidence. Aquarium and room rewards are visit celebrations, never a science-proficiency measure.

## Verification

- Local `npm run check`: passed, including 253 unit tests, typecheck, architectural/privacy lint and production build.
- Focused `life-cycle.test.ts`: deterministic content, choice validity, explicit levels, support/model/skip evidence, duplicate saves in memory and IndexedDB, old-lab preservation, child scoping and sync round-trip.
- Focused `life-cycle-flow.test.ts`: explicit learner level, duplicate completion, feedback cancellation, stale callbacks after close, no-audio flow, saved replay and save retry.
- Existing Hoot cancellation, sync, rewards and teacher-registry suites remain in the full check.
- Local browser execution is blocked by the verified sandbox socket restriction; no local browser pass is claimed. The dedicated Nova workflow runs the focused E2E suite on desktop and the actual Pixel 7 Playwright project, with synthetic screenshots and failure traces. Remote results must be checked for the exact published head before approval.
- Browser fixtures replace names with Sample / Sample sibling / Sample parent and remove birth dates before screenshots or traces of the activity. Browser tests never connect to family sync or production data.

## Owner acceptance

1. Open Nova → Choose an activity → Growing and changing. Confirm Sink or Float still launches as the default.
2. Try both explicit levels. Match pictures by touch and use keyboard Tab/Enter on desktop. Check the three-choice challenge on a phone.
3. Ask for a hint/model, skip, close, reopen and replay. Verify no unfinished attempt appears; supported answers and skips are labeled honestly.
4. Save a complete run twice rapidly, reload, and check the parent report. Only one attempt per run should exist, under the selected child.
5. Review the model facts and the current-ceiling/next-activity guidance. Review desktop/phone screenshots and exact-head CI before approving any merge or deployment.
