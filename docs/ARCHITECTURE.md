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
parses the browser's request with `parseTeacherAiInput`, builds the Anthropic
Messages body with `buildTeacherRequest` (system prompt with persona + safety
rules, alternating turns, forced `teacher_reply` tool), and returns only the
tool input. `main.ts` wraps it in `node:http` on 127.0.0.1; `scripts/ai-helper.mjs`
starts it from `dev`/`preview` when `.env.local` has a key.

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
