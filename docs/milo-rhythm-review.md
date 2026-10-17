# Milo: bounded music lesson review

Issue #13, stacked on Nova #40 at `f0469dbf462e6e4f2810186b8ae28f0d8721f684`, which includes chooser #33 and main `5e2aaf9`. This draft does not authorize a merge or deployment. The issue stays open for full owner acceptance and release.

## Learning sequence and access

Milo is an original lavender otter with a drum, a dedicated portrait, bounded local dialogue, and a discoverable classroom model at x −4.8, z −6.8, outside the alphabet rug and away from its dance flag. The registry preserves historical IDs and teacher routes. `RhythmFlow` is isolated from shared lesson stages.

Two beats are the default. Grown-ups can deliberately select two, three or four in Settings; this child-scoped choice applies to the next visit. No speed or success score changes it. A copy visit offers a skippable three-tap comfortable-pace warm-up, listen/watch and replay, guided copy of pattern A, then a fresh contrasting pattern B and one independent attempt. Feedback waits for the learner. Hints and subsequent models mark support. Skip, close without saving, replay after saving, and a visible untimed alternative avoid forced repetition.

The non-timed route matches labeled beat-and-pause diagrams. It does not require waiting for playback or responding to a deadline. Native buttons support touch, Enter, Space and assistive activation; repeats and modified keys do not count as taps. Focus stays in the modal and Escape closes. Sound is optional, follows household mute/volume, and can be stopped during playback. All sounds are original oscillator synthesis; unavailable output falls back to visual-only. Pulses change a numbered circle's fill/border without movement. Reduced-motion CSS disables animations. There is no microphone, recording, external link, AI chat, remote speech or network teaching path.

## Timing contract and limitations

- Default pulse is 800 ms. Optional three-tap warm-up uses the mean of two positive intervals, with a minimum of 800 ms; samples beyond 30 seconds or invalid clocks are discarded. It changes playback pace for this visit only, never an ability level. Very slow or variable access has the fully untimed diagram alternative.
- Short gaps are one pulse; long gaps are three. A reproduced interval is accepted within ±max(400 ms, 45% of the target interval). At the 800 ms default the windows are 400–1200 ms and 1320–3480 ms, respectively. Tests prove boundaries and that contrasting patterns cannot both pass, including slower calibrated paces.
- Timing begins at the learner's first tap, with no deadline for that first tap or later inputs. Constant reaction, input and output onset offsets cancel in successive intervals. This is latency mitigation, not a measurement or guarantee of universal device/input calibration.
- When available, Web Audio output latency (otherwise base latency) offsets visual scheduling to approximate audible onset. It is only an estimate and does not establish actual hearing or headphone availability.
- A playback callback more than 250 ms late invalidates playback. An input event queued more than 250 ms is exploratory, not evidence. Blur/hidden tab, sound changes and cancel clear incomplete input and require a fresh model. Every pending timer/oscillator is cancelled on close; async resume cannot restart closed playback.
- Matching intervals do not establish a stable musical tempo, hearing, instrument proficiency, motor ability or general musical ability. Unmatched timing is explicitly exploration; it never creates negative mastery evidence, speed ranking or automatic demotion.

## Evidence and persistence

Two reviewed narrow Family-framework skills are added under Creativity / Performing arts:

- `art.rhythm-copy`: copying a two-to-four-beat interval pattern within the generous tolerance.
- `art.rhythm-recognize`: matching a visual beat-and-pause picture without timing. It is not reproduction or auditory-discrimination evidence.

Only matches create performance evidence. The first required listen/watch presentation is the task stimulus, like hearing a question; an independent claim means copying the fresh pattern after that stimulus without an additional model or hint. Guided/model/hint success is supported; the independent pattern differs from the guided example. Input (`keyboard`, including assistive button activation; `touch`; or `mixed`) and presentation (`visual-only` or `sound-and-visual`) remain explicit. Recognition always records visual-only choice evidence regardless of optional playback. The sound-and-visual label records presentation, not a claim that the learner heard it.

Exploration and skip remain in the human-readable parent summary; legacy problem records use `skipped` rather than falsely treating an unreliable timing sample as `not_yet`. No raw tap timestamps, calibration pace, latency or audio are persisted or transmitted. Two rounds produce one stable child-scoped completion ID and stable evidence IDs through the existing atomic learning, mastery, progress and unlock pipeline. Each run is bound to its intended child when opened; the keyed flow remounts on a child switch, and the service rejects mismatched run ownership and nonexistent profiles. Duplicate/concurrent retries do not multiply records; siblings remain separate. There is no new reward set, database migration, service, permission or credential.

## Verification

- `npm run check`: typecheck, architecture/privacy lint, deterministic tests and production build.
- Dedicated tests cover deterministic/contrasting patterns, timing boundaries, latency-offset invariance, wrong-pattern rejection, calibration, output cancellation/fallback, narrow skills, memory/IndexedDB/syncing deduplication and child isolation, hint classification, fresh independent work, blur/cancel/stale callbacks and save retry.
- `milo-rhythm.spec.ts` targets desktop Chrome and true Pixel 7 emulation: actual keyboard/touch copying; visual-only, no voice/headphones; parent selection and evidence; untimed matching; mute mid-play; blur, skip, Escape, reload and focus; existing Pippa/Digit/Nova launches; and real floor-tap walking plus collision clearance and visible Milo interaction, not teleport-only discovery.
- Browser screenshots use synthetic Sample / Sample sibling / Sample parent profiles, omit birth dates and pronunciation hints, and explicitly reload after direct IndexedDB fixture writes.
- Hosted CI and screenshot review must be checked against the exact published head before calling this ready. Local Chromium is blocked by the environment's socket restriction; no local browser pass is claimed.

## Approval checklist

Inspect the world-placement, guided/independent copy, untimed recognition, muted controls, paused state and parent evidence captures. Review both timing/evidence ceilings and accessibility comfort. Keep merge/deploy approval separate; broad issue completion is not claimed by a draft PR.
