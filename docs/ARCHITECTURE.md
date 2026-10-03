# Architecture

This document explains how the pieces fit together and why. For setup and
commands see the [README](../README.md).

## Layers

```
            ┌──────────────────────────── ui/ (React 19) ────────────────────────────┐
            │ home · child mode (HUD, dialogue, lessons, overlays) · parent studio  │
            │ · Learning Museum                                                       │
            └───────┬───────────────────────────────┬────────────────────────────────┘
                    │ calls use cases               │ drives (imperative API)
            ┌───────▼────────┐              ┌────────▼─────────┐
            │  services/      │              │  engine/ (three) │  renders a WorldState,
            │  use cases,     │              │  world, camera,  │  emits interactions;
            │  atomic commits │              │  input, nav, fx  │  no React, no storage
            └───────┬────────┘              └────────▲─────────┘
                    │ repositories                  │ WorldState (pure data)
            ┌───────▼────────┐              ┌────────┴─────────┐
            │  data/          │              │  domain/ (pure)  │  curriculum, mastery,
            │  IndexedDB /    │◀─────────────│  rewards, world, │  lessons, interpreter,
            │  memory, seed   │   types      │  reports…        │  reports — no I/O
            └────────────────┘              └──────────────────┘
   app/ = composition root (creates services once, provides them via context)
```

`npm run lint` enforces the arrows: `domain` imports nothing but itself;
`data`/`services` never import UI, engine or React; `engine` never imports
React, services or storage; `shared/` holds canvas painters used by both the
engine and the UI (book covers, kid art).

## The core loop as data flow

```
Child taps "Finish a book" → HootFlow (LessonRun over storyChatLesson)
  → answers: ProblemAttemptRecord[] {outcome: independent | supported | not_yet}
  → ChildMode.finishBook → services.completeBook(ctx, childId, input)
       UnitOfWork: book(completed, shelfIndex) + readingSession + evidence[]
                   + portfolio item + teacherInteraction(transcript)
       finalizeLearning(): recompute mastery for touched skills
                           → buildSnapshot() → evaluateNewRewards()
                           → rewardUnlocks (celebrated=false)
                           → ONE atomic commit
       returns { newRewards, masteryChanges, snapshot, world }
  → engine.celebrateBook(book → flies to shelf slot) → revealUnlocks(ids, world)
  → Celebration overlay → markRewardsCelebrated()
Parent studio live-queries the same tables and re-renders.
```

### Free talk ("I read Daddy the Goodnight Leelanau book")

```
Mic tap → Mic.listen (ChildMode: talkMode + the on-device answer a parent's
          "Check this browser" saved in meta.speechProbe → SpeechInput.check;
          on-device first, cancels teacher speech, phrases = her titles + catalog)
  → words → useTeacherTalk.send → TeacherChatService.respond({teacher, name,
            utterance, history (flow transcript, last 8), books, topic})
       LocalTeacherChat: understand() → intent/title/readTo/finished
                         → resolveBook() (her list → catalog → prefix → Title Case)
       HttpTeacherChat:  safety cues → local (never sent) · else POST helper
                         /v1/teacher → validateTeacherReply + sanitize → fallback
  → nextTopic() keeps {book, finished, readTo, readBy} across turns
  → HootFlow shows the reply + a big next-step button:
       finished → finishFromTalk → the usual story chat → completeBook
                  (sessionNote "Izzy read it aloud to Daddy", readingMode,
                   parentNotes) · not yet → bookmark (logReading / addBook)
  → transcript lines carry via: 'voice' | 'typed' | 'ai'; parentNotes land on the
    TeacherInteraction and surface on Today until a parent marks them read.
```

The helper (`scripts/ai-helper/handler.ts`) is socket-free and unit-tested: it
parses the browser's request with `parseTeacherAiInput`, builds the request —
OpenAI Responses API (`openai.ts`: forced `teacher_reply` function call,
`reasoning: none`, `store: false`) when an OpenAI key is configured, otherwise
the Anthropic Messages body (`buildTeacherRequest`: forced `teacher_reply` tool) —
with the same system prompt (persona + safety rules), and returns only the
structured reply. With OpenAI it also speaks teacher lines (`/v1/speak`,
`gpt-4o-mini-tts`, per-teacher voice) and turns her recordings into words
(`/v1/listen`, `gpt-transcribe`); the browser side is `src/voice/helperVoice.ts`
(consent-gated, falls back to the built-in voice / recognizer). `main.ts` wraps
it in `node:http` on 127.0.0.1; `scripts/ai-helper.mjs` starts it from
`dev`/`preview` when `.env.local` has a key; `lambda.ts` serves it on AWS and
reads the OpenAI key from Secrets Manager (`awsSecret.ts`, SigV4, cached an hour).

A parent-logged activity follows the identical `finalizeLearning` path, so a
"we planted beans" entry can open the greenhouse; the unlock stays
`celebrated=false` until the child next enters her school, where it is
celebrated with a camera shot of the new room.

## Domain modules

- **curriculum/** — `DOMAINS`, `STRANDS`, `SKILLS` with prerequisites (acyclic,
  validated by `validateCatalog()`), difficulty 0–5, topics, lesson links and
  standards. The catalog is data; adding a skill is a one-entry change.
- **mastery/** — `computeMastery(evidence)` expands evidence into an ordered
  trial sequence (exposure excluded), then applies the rules in the README.
  `updateMasteryRecord` preserves history and parent overrides.
- **adaptive/** — `buildDomainProfiles` computes a descriptor per domain and
  strand (not yet explored → emerging → developing → strong → advanced; "strong
  vs. advanced" compares the working difficulty with an age expectation that is
  shown to parents only). `recommendNext` scores review / continue / ready /
  consolidate candidates; `chooseStartTier` starts lessons at the first tier
  that isn't yet proficient.
- **lessons/** — `LessonRun` is deterministic given a seed: first-try success is
  independent, two in a row raises the tier; a miss walks the ladder (`hint` →
  `simpler` stepping-stone → `alternate`) and finally models the answer,
  records `not_yet` and eases the tier. Lesson content (`moonRocks`,
  `sinkFloat`, `storyChat`) is just generators that return `Problem`s.
- **interpretation/** — `ActivityInterpretationService` interface.
  `LocalHeuristicInterpreter`: sentence split → context carry-over (reading /
  cooking / nature / art…) → clause-level independence cues → rule lexicon →
  merge per skill. `HttpInterpretationService`: consent-gated, validated,
  falls back to local.
- **teachers/** — personas and openers (`teachers.ts`); free conversation
  (`chat.ts`: `understand`, `resolveBook`, `localTeacherReply`, `nextTopic`,
  `sanitizeTeacherReply`, `validateTeacherReply`); the consent-gated AI adapter
  (`chatRemote.ts`, the only other file allowed to use the network); and the
  prompt/request builders the local helper uses (`aiPrompt.ts`).
- **settings.ts** — defaults (`talkMode: 'device'`, AI teachers off) and
  `normalizeSettings` for households saved by older versions.
- **rewards/** — declarative rules (`books`, `topic`, `lesson`, `artworks`,
  `masteredInDomain`); `evaluateNewRewards` / `upcomingRewards`.
- **world/** — `deriveWorldState(snapshot, unlocked)` → everything the engine
  needs (shelf units, rooms, plants, exhibits, rocket stage, pets…).
  `buildMilestonePreview` boosts a *copy* of the snapshot for parent previews.
- **reports/** — `generateReport(inputs, {audience, start, end})` produces an
  immutable `ReportContent` snapshot (parent record vs. family update).
- **play/circuit.ts** — the rug's dance & gym circuit: the 17-move catalog,
  `circuitFor(child)` (her family's 10 stations, defaults elsewhere),
  `stepOn(run, n)` (1 starts, the right next number advances, 10 after 9
  completes; any number still does its move) and the coach's lines. The
  engine side is `engine/characters/moves.ts` (pure pose functions over
  t = 0…1, eased so every move starts and ends standing; played by
  `AvatarModel.perform`, which pivots flips around her middle and tips the
  upper body at the hips) and `engine/world/danceMat.ts` (where the painted
  numbers are, the next-number glow, the start flag). `Game` notices her
  entering a number — only the one a tap was heading for — turns her a little
  off the camera, leans the camera in, plays the move with its sounds and
  sparkles, and reports `onStation(n)`; `ChildMode` keeps the run, the HUD
  and the callouts, and saves `circuitsDone`.

## Persistence

`Database` is a tiny interface (`table().get/all/where/put/delete`, `commit(ops)`,
`subscribe`). `IndexedDbDatabase` performs additive schema upgrades and
broadcasts change notifications to other tabs via `BroadcastChannel`;
`MemoryDatabase` implements the same contract for tests and private-browsing
fallback. `Repositories.forChild()` always queries through the `childId` index.
`useLiveQuery(query, deps, tables)` re-runs a query when a relevant table
changes, which keeps parent pages and the museum current without manual
refreshes.

## Engine

- `Game` owns the renderer (ACES tone mapping, PCF shadows, subtle bloom),
  lights, the frame loop (`?maxfps`, real-time dt), pointer handling and the
  public API used by React (`applyWorld`, `celebrateBook`, `revealUnlocks`,
  `focusTeacher`, `setAvatar`…).
- `SchoolWorld` assembles the building (`structure.ts`: floor, walls with
  cutaways so the child is never hidden, window light pools), rooms
  (`library`, `classroom`, `science`, `museum`), the bookshelf and teachers,
  then merges static props into per-material batches (`bake.ts`).
- Systems: `InputManager` (keyboard + gamepad intents), `PlayerController`
  (direct or tap-to-walk), `NavGrid` (A* with smoothing over a
  `CollisionWorld`), `CameraRig` (follow with look-ahead + cinematic shots),
  `InteractionSystem` (proxies, markers, focus ring), `Particles`.
- Quality presets (`high`/`balanced`/`low`) scale shadows, pixel ratio and
  bloom; software renderers are detected and dropped to `low` automatically.
- All qualities share softer sunlight, pendant lights, and window-light pools.
  Rugs are matte and nonemissive; reduced exposure and a higher bloom threshold
  keep pale surfaces from glowing while discovery cues remain distinct.
- The dance start flag stands in the aisle beside the numbered rug. Its position
  leaves room for the pennant and interaction marker in the follow camera;
  station 1 continues to start the circuit automatically.
- The child's name is passed in (chalkboard greeting, shelf plaque, art
  signatures) — nothing in the engine is specific to one child.

## UI

- Child mode uses big targets (≥64px), icon + text choices, typewriter speech
  with optional read-aloud, reduced-motion support, and never shows grades,
  standards, scores or "wrong".
- The parent studio is dense but calm (Inter + Fraunces), responsive down to
  phone width, printable reports, and a validated sequential color ramp for
  mastery levels (always paired with text labels and a table view).
- The Learning Museum uses kid-facing subject names and only independent
  evidence, with a guided tour mode that works with a TV remote/keyboard.

## Testing strategy

Pure domain code is tested directly; services are tested over
`MemoryDatabase`; the IndexedDB adapter is tested against fake-indexeddb for
reload persistence; Playwright covers the two user journeys that matter most
(child core loop, parent entry → report → museum) on desktop and phone.
Automation hooks (`window.__izzy`) exist only in dev and e2e builds.

## Adding a teacher

Stable teacher IDs and routing live in `domain/teachers/registry.ts`. The registry
contains subject domains, a working activity, placement/model, room description,
local dialogue, start copy and celebration metadata. `TeacherId` derives from its
keys; profiles are a complete typed map. The engine builds every registered scene
and requires a factory for each model. UI launch and helper speech/chat allowlists
use the same registry. Unknown stored IDs retain their records, receive a neutral
Past teacher portrait, and are rejected by the helper and scene factory.

For one new teacher:

1. Register an original stable ID, domains, safe location and a complete local
   activity. Never add a selectable placeholder or reuse a retired ID.
2. Add the persona, introductions and built-in/natural voice fallbacks to the
   typed profile map. Keep learner descriptions generic and optional AI consent
   unchanged. Put bounded question/share replies in the registry; safety intents
   retain the existing parent escalation.
3. Add the original scene model factory and accessible portrait. Check the
   chalkboard, dance stations, navigation and phone HUD for obstruction.
4. Register the deterministic lesson and its parent/child title. Review each
   curriculum link and evidence classification; free creation is an observation.
   Use the atomic learning service, stable completion/evidence IDs and child scope.
5. Test registry completeness, helper allowlists, unknown and old saved IDs,
   offline dialogue, scaffold/cancel/replay/completion, parent records and
   desktop/phone journeys. Run `npm run check` and affected browser regressions.

Local Chrome can be selected with `PLAYWRIGHT_CHANNEL=chrome`. Set
`PLAYWRIGHT_TRACE=off` if trace collection hangs in the installed browser; this
changes diagnostics only. Defaults still use the normal Playwright runtime and
retain failure traces. New branches remain draft; registry and lesson
checks do not authorize merge, deployment or new account access.

### Pippa's bounded Shape Studio

Pippa is an original fox teacher registered under the stable `pippa` ID. The
three-round `patterns-shapes` lesson starts with two single-shape matches,
each offering two large SVG choices, then invites a shape picture. Circle,
triangle and square have distinct geometry and accessible labels, so color
is not the sole cue. Native buttons support keyboard activation and touch.
Show me marks the answer as supported; skip, close and replay remain local.
After two independent matches, an optional AB pattern challenge becomes
available. Starting it first saves the completed matching run, then creates
a fresh run. Pippa's lesson never increases difficulty automatically.

Matching maps to the Family-aligned `reason.shape-match` skill; only the
explicit optional challenge maps to `reason.visual-patterns`.
Free design maps to `art.shape-design` as a descriptive observation with zero
correctness trials; it can introduce the skill but cannot earn performance
mastery. It does not claim 3D art-making, invent learning standards, or call the
AI helper. Every completed lesson run has a stable UUID, an atomic insert guard,
and child-scoped evidence; cancelled runs and skipped rounds produce no new
performance evidence. Replay discards the unsaved round and starts a fresh run.

The five-letter keyboard lesson highlights individual colorful tiles on the
actual classroom alphabet banner. The camera frames each target on portrait
and landscape screens, and found letters gain stars. Two large touch choices
provide a fallback; physical and touch evidence remain distinct. Resize and
interruption restore the appropriate camera and interaction markers. Optional
speech, help, skip, focus, repeat-key and composition guards remain available.
