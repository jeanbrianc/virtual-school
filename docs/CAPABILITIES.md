# Classroom capabilities and content boundaries

## Release status

This is the **combined candidate**, not a shipped release. Inventory was reproduced
at integration checkpoint `5c77bb8622511445ab2439cced1b2e63a2add725`, tree
`a048516629b9faa8fd5c0c6276824885e814a607`. Final combined-head checks, independent
review, owner approval and publication remain distinct gates.

The verified live baseline is main `2f0f7d768817e65dd309c08eb0ce66c9f711a9c7`, tree
`2921ef4f5c8838cbcf0d2d31a47929d9cc4217cd`, from
[PR #42](https://github.com/jeanbrianc/virtual-school/pull/42), with deployment and
read-back verified October 17, 2026 at 15:47 UTC. Its earlier validation does not
validate this combination. See [the release inventory](RELEASE-INVENTORY.md).
Counts describe source content, never learner assessment.

## Exact inventory change

| Source-derived inventory | Pre-PR #42 release `5e2aaf9` | Live PR #42 / `2f0f7d7` | Combined candidate |
| --- | --- | --- | --- |
| Tracked curriculum skills / domains / strands | 83 / 8 / 21 | 88 / 8 / 21 | 100 / 8 / 21 |
| Teachers / directly registered lessons / activity-title entries | 4 / 3 / 7 | 4 / 5 / 9 | 6 / 8 / 14 |
| Book catalog titles / original questions | 15 / 29 | 20 / 49 | 20 / 49 |
| Shelf capacity / reading-reward thresholds | 100 / 1, 5, 10, 15, 25, 50, 100 | Unchanged | Unchanged |
| Full-map state / introductory country targets | 50 / 11 | Unchanged; eight-state beginner pool added | Unchanged |
| Sink-or-Float objects / circuit stations / avatar moves | 12 / 10 / 17 | Unchanged | Unchanged |

PR #42 added three represented 20–99 place-value goals and two life-cycle picture
goals. The candidate adds 12 narrowly scoped skills: four pattern-continuation,
two fictional routine/constraint, two rhythm-copy/visual-recognition, two weather-
picture/chart and two no-regrouping arithmetic-answer skills. Existing broad IDs
and evidence are retained; they are not upgraded into new claims. The beginner
geography objective remains in its separate registry.

The eight direct definitions are `moon-rocks`, `base-ten-mission`,
`base-ten-arithmetic`, `patterns-shapes`, `pattern-progression`, `sink-float`,
`life-cycle` and `weather-pictures`. Tavi's routine and Milo's rhythm are dedicated
flows, not extra direct lesson definitions. Their two titles, plus keyboard,
state map, country map and story chat, bring the title registry to 14. Teacher
routes, direct definitions, title entries and tracked skills are different
inventories; none counts complete curricula or learner mastery.

## Activities in the candidate source

| Teacher or entry | Source content | Boundary and evidence |
| --- | --- | --- |
| Professor Hoot | Book logging and conversation; 20 catalog titles / 49 original questions; up to two questions per completion; parent-selected suggested/gentler/deeper priorities and explicit question-history rotation | Custom reflections, narration and one optional parent-authored prompt/reference answer remain ungraded. AI book facts are marked unverified. No phonics, decoding, fluency, grade or complete reading-curriculum claim. See [story content](HOOT-STORY-CONTENT.md). |
| Digit: Moon Rock Rescue | Unchanged five-round default with seven tiers: count to 10; count to 20; compare groups; add within 10; add/subtract within 20; equal sharing; equal groups | Last tier uses 2–4 groups of 2–5, total at most 20. Reading level does not establish math readiness. |
| Digit: Tens and ones mission | Five-round mission: identify, compose and decompose represented numbers 20–99 | Bundles/units remain visible. Parent chooses goal and learning/review purpose. Hint/retry/model/skip observations stay distinct; review does not advance new-learning mastery. This task does not itself assess arithmetic. See [place-value boundary](DIGIT-PLACE-VALUE.md). |
| Digit: Base-ten Workshop | New four-round parent-selected addition or mixed addition/subtraction choice task; two-digit operands, results 0–99, no regrouping | Three-choice answers with represented operands, not manipulation, a particular algorithm or abstract transfer. Review is default; parent can choose new learning. No automatic promotion, reading-based placement or rocket credit. Hints/retries/models are distinguished; model-only viewing is ungraded. See [arithmetic limits](DIGIT-ARITHMETIC.md). |
| Nova: Sink or Float | Unchanged four-round default; 12 objects; predict/observe, materials and generalize-from-evidence tiers | A small material-properties investigation, not a full science curriculum. |
| Nova: Growing and changing | Four rounds using flowering-plant and butterfly four-stage models; explicit two-choice picture matching or three-choice next-stage selection | No automatic level change. Hints/models/retries are supported; skips create no skill evidence. Not real-organism observation or full causal explanation. See [life-cycle limits](nova-life-cycle-review.md). |
| Nova: Sky picture detectives | New four-round picture matching or comparison of fictional three-/four-day charts; sun/no drawn clouds, clouds/no drawn rain, rain and snow symbols | One next task at an explicitly chosen level; no automatic promotion. Picture/chart evidence does not establish real weather observation, a forecast, climate or full standard mastery. Hints/models/retries mark support; skips create no science evidence. Optional authored local-only narration. See [weather limits](nova-weather-review.md). |
| Pippa: Shape Studio | Unchanged three-round default: matching or optional AB, then one creative shape choice from a randomized pair of circle/triangle/square | The final choice is a descriptive observation, not a correctness trial or saved drawing. |
| Pippa: Pattern playground | New four-round explicit matching, AB, AAB, ABB or ABC choices using circle/triangle/square and visible grouped patterns | Assesses selecting one continuation with a model visible, not rule discovery, copying, explanation or drawing. No automatic promotion; hint/model/retry support is explicit. No portfolio artwork or artwork reward credit. See [pattern limits](pippa-pattern-progression-review.md). |
| Tavi: What comes next? | Two fictional art-box/toy-bag sequencing rounds; two cards by default, explicit three-/four-card options; either valid middle-item order accepted | Two skill views of the same observed constraints, not two independent assessments. Help/model/retry/simpler/grown-up support stays explicit. Does not establish actual chores, self-care, family habits, reading or motor ability. Optional strict-local narration. See [routine limits](tavi-routine-review.md). |
| Milo: Beats and little pauses | Guided then fresh independent two-to-four-beat copying, or fully untimed visual beat/pause matching; optional synthesized sound | Separate copying and recognition skills. Extra replay/models/hints mark support; unreliable/unmatched timing is exploration, not negative mastery evidence. Sound presentation does not prove hearing; no broad musical/motor ability claim. No microphone, recording or remote teaching path. See [rhythm limits](milo-rhythm-review.md). |
| Chalkboard alphabet | Five-letter trail, starting A–E and expanding through Latin A–Z | Physical-key matching and labeled touch participation stay distinct. No timer, typing-speed or phonics claim. |
| Globe / Nova | Five-round beginner state-shape adventure: three choices from eight states, Florida first; explicit full 50-state or harder 11-country map choices | Labels/models/retries supported; skips distinct. Each outline has its own scale, so sizes are not comparable. See [full-map provenance](GLOBE-RESTORATION.md) and [beginner limits](GLOBE-BEGINNER-LEVEL.md). |
| Dance/gym mat | Ten sequential numbered avatar stations; 17 available moves | Movement/counting play, not a physical coaching qualification or academic mastery assessment. |
| Seating | Eleven registered seats, safe stand-up exits and a garden-couch book pose gated by the existing Reading Nook | Visual play only: no book completion, reading time, lesson, mastery, reward or other progress credit. Existing learning entry points must remain reachable. |

The shared chooser preserves original defaults and adds explicit Digit, Nova and
Pippa options. Tavi and Milo use their own routes. Dismissal returns to the intro
without replacing an active lesson. Hoot's existing reading flow and chalkboard
entry remain; registry membership alone does not prove every entry is exposed
in every chooser.

The **100 tracked skills, eight domains and 21 strands** support parent
recordkeeping goals and alignments, not 100 playable lessons. Parent activity
interpretation, evidence review, portfolio, reports, saved summaries, available
transcript turns and the family museum extend beyond the lesson pool. Teacher
talk's new privacy copy explicitly distinguishes stored summaries/transcripts,
optional AI text, separately controlled speech/microphone sharing, sync and
exports. Some saved activities have empty transcripts; no word-for-word archive
of every interaction is promised. The copy adds no retention enforcement.

## Learning support and offscreen practice

A correct response is interpreted within the actual task and support shown, not
as proof of a general ability. Hints, retries, models and declared help must remain
visible in evidence; viewing a model or skipping is not an independent success.
Small same-session runs do not establish broad proficiency or delayed retention.
Explicit activity levels are not inferred from advanced reading or age.

Useful separate activities include moving real tens-bundles and loose objects
with fresh numbers; continuing/copying blocks and explaining their repeating
group; observing an actual plant across days; drawing real weather seen safely
through a window without looking at the sun; packing a toy bag together; and
clapping comfortably or matching untimed beat/pause cards. A grown-up can record
what was actually observed, including help. These suggestions are not recorded
app outcomes or automatic transfer/skill credit.

## Rewards and book growth

Reading thresholds are 1, 5, 10, 15, 25, 50 and 100 completed book records. At 25 the
Reading Nook opens; at 50 the Grand Library shelf/ladder/chandelier appears; at
100 a dragon and crown celebrate the quantity. These are decorative/display
rewards. They do not unlock a new teaching tier or prove comprehension/phonics.
The garden-themed nook in PR #31 retains the same 25-book threshold.

PR #38 changes book-arrival framing to the saved destination, including grand
shelves and floor overflow. Narrow screens use a shorter arrival path; interruption
settles the saved book and restores the camera/material state. It adds no shelf
capacity, record-count limit, reading evidence or reward threshold. See
[the camera validation boundary](BOOK-ARRIVAL-VALIDATION.md).

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
- The candidate's selected-learner **Delete records** removes learning records
  and photos but preserves the profile and avatar appearance. A reference to a
  deleted avatar inspiration photo is cleared. This is not account deletion or
  provider-data deletion. Other learners' records remain outside this operation.
- Avatar inspiration photos are hand-selected visual references, with no face
  analysis; as ordinary media they participate in opt-in family sync.
- Sync can propagate edits/deletions and keeps existing conflict semantics. It is
  not a versioned independent backup or a proven disaster-recovery service.
  Never test restore/reset against real learner history.

## Optional AI, usage and speech

Core lessons and local teacher dialogue need no AI provider. Optional
parent-consented AI replies, natural voices and helper listening use configured
providers; browser speech fallback has separate parent choices. Configuration
checks are not successful live-provider/playback tests. Text and offline lesson
participation remain available when optional services fail. Ordinary browser
read-aloud can use the browser default if no listed local voice is available;
every strict `localOnly` line, including contained conversations and the new
routine/weather narration, requires a listed local-service voice or silence.
Audio caches, provider retention and application records are separate. A successful
deployment does not verify live-provider availability, audible playback or the
account's approved retention configuration. See
[the provider-data limits](DEPLOY.md#provider-data-handling-and-release-limits).

PR #36 adds the parent-only usage card: tab-memory request outcomes, cache hits,
fallback calls and allowlisted reported units. Reload, Clear or the next UTC day
resets the observed window. Other tabs/devices, prior loads and provider activity
are missing. Zero observed requests is not zero account usage. The saved warning
threshold is advisory; estimated API cost, verified billing and hosting cost are
unavailable. Existing helper throttles are process-local, not durable household
quotas or monetary caps. The quota and Realtime speech code are offline sketches,
not enabled production adapters. Durable enforcement and voice migration remain
#25/#26. See [usage limits](AI_USAGE_AND_QUOTAS.md) and [voice plan](VOICE_MIGRATION.md).

PR #46 keeps a recognized sensitive teacher conversation local for subsequent
turns and read-aloud, including retained history, Back and adapter changes.
Contained speech uses local-service voices or visible text; transcripts and parent
notes remain intact. Recognition is bounded: it cannot identify every sensitive
utterance or recall prior transmissions. Parent-enabled browser/helper speech
recognition can transmit audio before its words are known. Existing family sync,
exports and record permissions are unchanged. This is not a universal no-data-
leaves-device claim or completion of the privacy backlog. See
[containment limits](SAFETY-CONTAINMENT.md).

## Reproduce and maintain the inventory

Run `node --import tsx scripts/capabilities.ts` after installing the pinned
packages. It reads the catalog/registries, validates catalog relationships and
lesson/teacher registration and declared lesson-choice ownership. It prints current
counts, question-bank IDs, tiers/objectives, life-cycle stages, reward thresholds
and map targets. It reads no learner records and makes no network calls.

Compare its output with this table whenever changing content. Inspect dynamic
ceilings in `moonRocks.ts`, `baseTen.ts`, `baseTenArithmetic.ts`, `lifeCycle.ts`,
`weather.ts`, `patterns.ts`, `patternProgression.ts`, `routine.ts`,
`music/rhythm.ts`, `HootFlow.tsx` and shelf layout code;
counts alone cannot establish pedagogy or UI quality. Run `npm run check` and the
relevant exact-head browser suites; record passed, failed and not-run separately.

## Excluded and still open

The candidate adds sanitized #39 documentation, #41 patterns, #43 avatar-preserving
record deletion, #44 routines, final #45 rhythm, #47 privacy copy, #48 weather,
final #49 arithmetic and corrected #50 seating. It preserves live PR #42's
#33/#34/#35/#36/#37/#38/#40/#46. In particular #37 place value, #40 life cycles
and #46 containment are already live and are not counted as new work here.

Phonics, a drawing/composition canvas, supported regrouping and new milestone/
reward proposals remain excluded. Existing reward thresholds and IDs remain.
The [roadmap #12](https://github.com/jeanbrianc/virtual-school/issues/12), broader
teacher depth (#20–#23), reading growth (#24), durable usage enforcement (#25),
voice migration (#26), full music/routine acceptance (#13–#14), and broader
privacy, multi-family isolation, provider-retention and pilot gates (#9–#11)
remain open. A bounded implementation does not close its broad issue or establish
educational outcomes. Dated feature-review documents retain their original
source-review context; [the release ledger](RELEASE-INVENTORY.md) governs this
combined candidate's status.

This matrix addresses [#27](https://github.com/jeanbrianc/virtual-school/issues/27)
and must be refreshed when the source or actual release status changes.
