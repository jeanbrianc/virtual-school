# Classroom capabilities and content boundaries

Source baseline: main `5e2aaf9dfff174501a07c6d5a028a10b68fed33f`, inspected October 17,
2026. This is a source inventory, not a learner assessment or release-status claim.
Subsequent draft PRs are planned until merged and their release is verified.

## Playable activities

| Teacher or entry | Available content | Boundary and evidence |
| --- | --- | --- |
| Professor Hoot | Book logging and conversation; 15 catalog titles / 29 original questions, selecting up to two questions per completion; custom-book feelings and favorite-part reflection | Authored prompts cover a bounded set. Custom reflections and optional AI talk do not verify arbitrary book facts. A completed book is not a fluency/grade/mastery assessment. |
| Digit | Five-round Moon Rock Rescue, seven tiers: count to 10; count to 20; compare groups; add within 10; add/subtract within 20; equal sharing; equal groups | Last tier uses 2–4 groups of 2–5, total at most 20. Place value/two-digit arithmetic are planned in #20. Reading level does not establish math readiness. |
| Nova | Four-round Sink or Float; 12 objects; three tiers: predict/observe, materials, generalize from evidence | Each round pairs a prediction with observation/explanation. This is a small material-properties investigation, not a full science curriculum. Life-cycle/weather labs remain #21. |
| Pippa | Three-round Shape Studio: same-shape matching, explicit optional AB continuation, a creative single-shape choice from a randomized pair drawn from circle/triangle/square | Design choices are descriptive observations, not correctness trials. AAB/ABB/ABC and saved drawing/portfolio are separate planned slices in #23. |
| Chalkboard alphabet | Five-letter trail, starting A–E, expanding through Latin A–Z | Letter/key familiarity. Physical-key matching and labeled touch participation are distinguished. No timer, typing-speed or phonics claim. |
| Globe / Nova | Five-round US-state or explicitly harder country-map adventures; 50 states / 11 countries | Observation-only objectives, not broad geography mastery. Beginner three-silhouette mode is pending PR #34. Full-map provenance and omissions are recorded in GLOBE-RESTORATION.md. |
| Dance/gym mat | Ten sequential numbered avatar stations; 17 available avatar moves | Movement/counting play, not a physical coaching qualification or academic mastery assessment. |

The curriculum has **83 tracked skills, eight domains and 21 strands**. These are
parent recordkeeping goals and alignments, not 83 playable lessons. Teacher
conversation, registered lessons and catalog skills are different inventories.
Parent activity interpretation, evidence review, portfolio, reports, teacher
transcripts and the family museum support recordkeeping beyond the lesson pool.

## Rewards and book growth

Reading thresholds are 1, 5, 10, 15, 25, 50 and 100 completed book records. At 25 the
Reading Nook opens; at 50 the Grand Library shelf/ladder/chandelier appears; at
100 a dragon and crown celebrate the quantity. These are decorative/display
rewards. They do not unlock a new teaching tier or prove comprehension/phonics.
The garden-themed nook in PR #31 retains the same 25-book threshold.

Four shelf capacities are 10 + 15 + 25 + 50 = 100. Later books currently appear in
floor stacks; sustainable bounded growth to 250 is planned in #24. Completion
logic has no fixed record-count cap, but browser storage and rendering have real
limits. No claim of unlimited storage or demonstrated 250-book performance is
made by this inventory.

An existing completed book cannot be completed again through `completeBook`.
Additional reading sessions on that record retain completed status rather than
adding another completion. A separately created book record is a distinct record;
there is no global same-title deduplication claim. Reward unlock IDs remain stable
and quantity counting must not silently change in future reread work.

## Local data, sync and recovery

- IndexedDB is the local source. Hosted family sign-in and opt-in family sync
  share one household's school, including records, conversations and media, via
  the existing DynamoDB/S3 stack. Sign-in alone is not permission to upload an
  existing local school; conflicting local/cloud schools require the parent flow.
- This is single-household synchronization, not tenant-isolated parent accounts.
  The local parent PIN is a casual interface gate, not encryption or server
  authorization. Other-family enrollment is blocked by #9/#10/#11.
- Settings exports one child's records as `izzys-classroom/v1` JSON. Media is
  referenced by ID; binary photos are not a portable embedded backup. A complete
  whole-school backup/import/restore UI is not shipped. The preserved-source
  inventory mentions such work outside the globe port; that does not make it
  supported in main.
- Sync can propagate edits/deletions and keeps existing conflict semantics. It is
  not a versioned independent backup or a proven disaster-recovery service.
  Never test restore/reset against real learner history.

## Optional AI and speech

Core lessons and local teacher dialogue work offline. Optional parent-consented
AI teacher replies, natural voices and helper listening use configured providers;
browser speech fallback has separate parent choices. Configuration checks are
not successful live-provider/playback tests. Provider failures should retain
built-in speech/text/offline participation.

Current helper request counters are per process, reset with runtime restarts and
not deployment-wide dollar caps. Model/pricing migrations and durable budget
controls remain #25/#26. No cost estimate here is verified account billing.

## Reproduce and maintain the inventory

Run `node --import tsx scripts/capabilities.ts` after installing the pinned
packages. It reads the catalog/registries, validates catalog relationships and
lesson/teacher registration, and prints current counts, IDs, tier labels, reward
thresholds and map targets. It reads no learner records and makes no network calls.

Compare its output with this table whenever changing content. Inspect dynamic
ceilings in `moonRocks.ts`, `patterns.ts`, `HootFlow.tsx` and shelf layout code;
counts alone cannot establish pedagogy or UI quality. Run `npm run check` and the
relevant exact-head browser suites; record passed, failed and not-run separately.

## Planned, not shipped

Roadmap: [#12](https://github.com/jeanbrianc/virtual-school/issues/12).
Teacher depth: [#20](https://github.com/jeanbrianc/virtual-school/issues/20),
[#21](https://github.com/jeanbrianc/virtual-school/issues/21),
[#22](https://github.com/jeanbrianc/virtual-school/issues/22),
[#23](https://github.com/jeanbrianc/virtual-school/issues/23).
Reading growth: [#24](https://github.com/jeanbrianc/virtual-school/issues/24).
Usage/voice: [#25](https://github.com/jeanbrianc/virtual-school/issues/25),
[#26](https://github.com/jeanbrianc/virtual-school/issues/26).
This matrix addresses [#27](https://github.com/jeanbrianc/virtual-school/issues/27)
and must be refreshed when those increments land.
