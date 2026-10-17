# Virtual Classroom

A local-first 3D learning world with guided activities — plus a
parent studio for recordkeeping, curriculum tracking, portfolios and reports.

**Combined release candidate, not yet shipped:** this checkout includes the
additional reviewed feature sources listed in
[the release inventory](docs/RELEASE-INVENTORY.md). Its source inventory was
measured at integration checkpoint `5c77bb8622511445ab2439cced1b2e63a2add725`
(tree `a048516629b9faa8fd5c0c6276824885e814a607`). Final combined-head review,
hosted checks, owner approval and publication are separate gates; earlier PR
results do not establish that this combination has shipped.

**Current verified live baseline:** [PR #42](https://github.com/jeanbrianc/virtual-school/pull/42)
was deployed as main `2f0f7d768817e65dd309c08eb0ce66c9f711a9c7`
(tree `2921ef4f5c8838cbcf0d2d31a47929d9cc4217cd`), verified October 17, 2026
at 15:47 UTC. It contains the eight earlier changes, not this candidate's additions.

- **Child mode** — an explorable, cozy 3D school. A learner walks around (keyboard,
  tap-to-walk, or a game controller), talks to the learner's teachers (Professor Hoot for
  reading, Digit for math, Nova for science, Pippa for shapes, Tavi for pretend
  picture steps and Milo for beats and pauses). Activities support taps and keys;
  eligible teacher conversations also offer typing and optional speech. A learner
  can log real books for the personal bookshelf and see the world respond to
  recorded learning and participation.
- **Parent studio** — describe the day in plain English ("we baked bread and the learner
  measured 2 cups of flour…") and the app suggests skills and evidence for you
  to review. Mastery, curriculum, portfolio, reports, saved activity summaries
  and available teacher-conversation turns support parent recordkeeping.
- **Learning Museum** — a warm family showcase (with a TV-friendly guided tour)
  for grandparents and visitors.

Everything is stored in the browser on your device (IndexedDB). On the family's own
hosted site, **family sync** (opt-in) keeps every signed-in device's school the same
through the family's own AWS account. The hosted sign-in protects one household; it is not a multi-family account system.
There are no ads, analytics, trackers, social features or child-facing external links.

On phones, the school menu sits below the status badges so **Grown-ups** stays
reachable. To share progress, open **Grown-ups → Settings & privacy → Family sync**
on the device holding the history and turn sync on once. Sign-in alone does not
upload a school. Wait for **Last synced**, then reload the other device; if it has
its own records, review the school-choice prompt before replacing anything.

---

## Quick start

Requirements: **Node.js ≥ 20.10** and a modern browser (Chrome, Edge, Safari 17+, Firefox).

```bash
npm install          # installs pinned dependencies
npm run dev          # http://127.0.0.1:5173 with live reload
```

Open the app and select a learner profile. The first launch is a brand-new, empty school:
no books, no history, nothing unlocked. Everything the learner can touch sparkles until
the learner discovers it, and the learner's teachers introduce themselves the first time they
meet. The **Grown-ups** button asks for the parent PIN — it starts as **1234**
(change it in *Settings & privacy*).

Want to see how things look after a few weeks? *Settings & privacy → Load
sample data* replaces everything with a clearly labeled example history;
*Start fresh* clears learning records again (names, avatars and settings stay).

### Talking to teachers (and optional AI teachers)

**Talk-to-text** is on by default in *on-device only* mode. In a synthetic
example, a learner says “I finished reading The Sample Kite with a grown-up.”
The words appear, Professor Hoot asks about that book, confirms whether it was
finished, and offers **Put it on my shelf!**. Reading-partner notes reflect the
learner's answer. On supported desktop Chrome, speech can be recognized on the
computer. The microphone button is available unless a parent turns talking off;
the first tap checks support for
on-device listening and downloads the voice pack if needed (a one-time ~60 MB
download from the browser, so the first tap can take a minute), and Chrome asks
once for microphone permission. *Settings & privacy → Talking to teachers* has
the same steps (**Check this browser**, **Download the voice pack**) plus
**Test the microphone**. Some browser builds crash the tab when asked about
on-device listening, so that question is only asked on a tap, behind a saved
marker that remembers a crash. In browsers without on-device recognition (Safari,
Firefox, older Chrome) either pick *Also allow the browser's speech service*
(the browser maker — Apple or Google — then hears the audio) or the learner can type.

**AI teachers** are off by default. The built-in teachers already understand
book talk (which book, who the learner read with, finished or not) without any network.
To enable optional AI replies for eligible conversation turns, natural voices
and helper listening with the existing parent consent:

```bash
cp .env.example .env.local     # then paste your key after OPENAI_API_KEY= (or ANTHROPIC_API_KEY=)
npm run dev                    # also starts the AI helper on http://127.0.0.1:8787
```

Then *Settings & privacy → AI teachers*: **Check connection**, tick the consent
box, and **Turn on AI teachers**. The key stays in `.env.local` on your computer
(git-ignored) and never reaches the browser; the helper builds the teachers'
instructions itself, only answers pages on this computer, and has a process-local request throttle
(`AI_DAILY_LIMIT`, default 300 replies per day per warm helper). Parallel workers and
cold starts have separate counters; this is not a deployment-wide usage total
or a monetary spending cap. Provider billing and hosting costs are separate. See [Privacy & safety](#privacy--safety) for
exactly what is sent.

**Check connection** confirms provider configuration; it does not prove that
speech requests succeed. **Voice → Test natural voice** sends a short sample
without child information, uses a small amount of API credit, and provides a
play control when generation succeeds. Quota or rate-limit failures show
recovery guidance; teacher read-aloud attempts browser speech and text remains
available. See the voice section for local-only and browser-default limits.

The parent usage card shows this tab's observed requests, outcomes,
cache hits and fallback calls. Reload, Clear and the next UTC day reset its
window. Advisory warnings do not block spending; account totals, verified billing
and cost estimates remain unavailable. Durable quotas and the Realtime speech
adapter are plans/offline sketches, not enabled services. See
[usage boundaries](docs/AI_USAGE_AND_QUOTAS.md).

The classroom uses softer direct light and restrained glow so both rugs retain
their colors and numbered stations remain readable across graphics settings.

### Your own domain (AWS)

The deployment scripts support private S3 hosting, CloudFront with HTTPS, a
welcome page with sign-in, and an optional Lambda AI helper at `/api`. Configure
the destination and review costs and permissions before deploying. The repository
workflow deploys approved changes on `main`; pull-request builds do not deploy.
See [docs/DEPLOY.md](docs/DEPLOY.md) for setup and operating constraints.

The deploy role binds the configured repository owner, repository ID and branch.
A copied deployment needs its own configuration and authorization.

### All commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with live reload (esbuild) on port 5173 |
| `npm run build` | Production build → `dist/` (static files; host anywhere) |
| `npm run preview` | Serve `dist/` on http://127.0.0.1:4173 with a strict CSP (starts the AI helper too, if a key is set) |
| `npm run ai-helper` | Run only the local AI helper (normally started by `dev`/`preview`) |
| `npm run deploy:aws` | Create/update the AWS stack and publish the site ([docs/DEPLOY.md](docs/DEPLOY.md)) |
| `npm run build:lambda` | Bundle the AI helper for AWS Lambda → `dist-lambda/ai-helper.zip` |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | Architecture boundaries + privacy/safety rules + Prettier check |
| `npm test` | Unit tests (Node test runner + tsx); the run reports the current count |
| `npm run test:e2e` | Builds the e2e bundle and runs Playwright (desktop + phone) |
| `npm run check` | typecheck + lint + unit tests + production build |
| `npm run format` | Prettier write |

URL switches (handy on older machines or in CI): `?quality=low|balanced|high`,
`?maxfps=30`. Reduced-motion system settings skip the camera intro sweep.

Playwright needs a Chromium: `npx playwright install chromium` on a new machine
(or set `PLAYWRIGHT_BROWSERS_PATH` to an existing install).

---

## Capabilities in this candidate

0. **First day.** A welcome card, then ✨ sparkles on every teacher and object.
   Touching something the first time explains what it does (the empty
   bookshelf, Digit's launch pad, the locked greenhouse with its progress…); a
   🧭 counter tracks discoveries and finding everything earns a "School
   Explorer" cheer. Books appear only when a learner tells Hoot about them or a
   parent adds them.
1. **Talk to a teacher.** Free-conversation flows offer a microphone and a
   “type it” box; bounded picture/rhythm activities use their own controls. Hoot works out which book the learner means (the learner's own list first,
   then a catalog of well-known titles — “frog and toad” → *Frog and Toad Are
   Friends*), who the learner read with, and whether the learner finished; “yes” / “not yet”
   answers carry on about the same book, and the next step is always a big
   button (*Put it on my shelf!*, *Bookmark it!*). Digit and Nova chat before
   their lessons (“let's go!” starts one). Recognized safety concerns receive an
   on-device response and a parent note. The existing PR #42 containment also keeps subsequent
   turns and read-aloud local for that contained conversation; recognition is
   bounded and does not cover every sensitive utterance.
1. **Enter school → walk → library → Professor Hoot.** Arrow keys/WASD, tap/click
   to walk (A* pathfinding around furniture), or a gamepad. Big glowing markers
   and a prompt show what's interactive.
2. **Finish a book.** Pick a recorded book or type a new title; matching catalog
   titles are suggested. For a recognized story, Hoot selects up to two authored
   comprehension questions from 20 titles / 49 original questions. Parent-selected
   suggested/gentler/deeper priorities and explicit question history guide selection;
   no grade is inferred. Incorrect attempts get gentle help without a penalty.
   Custom-title feelings, favorite parts and narration remain ungraded. One optional
   parent-authored prompt/reference answer is also ungraded; AI book facts are
   unverified. A star rating records an opinion, not a skill score.
3. **The book flies to the shelf** in a short cinematic; the HUD counter ticks
   up. At 10 books a second bookshelf rises; 25 opens a reading nook; 50 the grand
   library; 100 hatches Ember the Book Dragon. The arrival camera
   follows the permanent shelf/overflow destination and uses a shorter narrow-screen
   path. Camera changes do not add capacity or new reward thresholds.
4. **Progress & rewards** are recomputed atomically with the new evidence.
   Rewards are only ever earned by learning — no currencies, loot boxes, timers
   or streak punishment.
5. **The world reacts**: plants → greenhouse, dinosaurs → fossil & skeleton,
   space → telescope & planet mobile, nature walks → nature table, artwork →
   art line & studio, Digit's missions → a rocket that is built stage by stage.
6. **Parent studio** shows the book, the per-question evidence (independent vs.
   with a hint), mastery changes, saved summaries and available transcript turns.
7. **Natural-language entry** → review/edit each suggested skill, outcome and
   independence → save. Evidence, portfolio, books and reward progress update;
   anything unlocked is celebrated next time the learner enters the learner's school.
8. **Reports**: homeschool record (evidence, levels, standards) or family update
   (warm, photo-friendly, no jargon). Print/PDF, download as a self-contained
   `.html`, or copy text for an email.
9. **Persistence**: all of the above survives reloads (IndexedDB), and multiple
   open tabs stay in sync.

**Dance & gym circuit.** The 1–10 numbers on the classroom rug are stations,
for a numbered movement circuit. Hopping onto a number
(walking, tapping it, or Space on the one the learner's on) makes the learner's avatar do that
number's move — a plié, bunny hops, a ☀️ sunshine twirl, a star jump, a
curtsey, an arabesque, a cartwheel, a frog jump, a backflip and a ta-da by
default, from 17 moves. Each number plays the next note up a scale. The
striped flag in the aisle beside the rug (or just stepping on 1) starts "the circuit": a
glowing ring and a bouncing star show the next number, a HUD counts 1 → 10,
and finishing all ten in order gets confetti and is saved (`circuitsDone`).
Digit calls out each station ("Three! Sunshine twirl! Next, number four!")
when read-aloud is on. In the Parent Studio, **Avatar → Dance & gym circuit**
picks the move for each number, an optional display name (for example, "sunshine arms"),
and previews any move on the avatar. The moves are procedural poses on the
avatar rig (`engine/characters/moves.ts`), so they work with any outfit.

### Bounded activities and next steps

The candidate registers **six teachers, eight direct lesson definitions and 14
activity-title entries**, with **100 tracked skills across eight domains and 21
strands**. Tavi and Milo use dedicated flows, so teacher, lesson and title counts
are different inventories. They are not counts of complete curricula or mastery.

- **Digit:** Moon Rock Rescue retains its five-round default and seven tiers,
  from counting to 20 through represented addition/subtraction, sharing and equal
  groups. The five-round **Tens and ones mission** identifies, composes and
  decomposes 20–99. The new four-round **Base-ten Workshop** lets a parent choose
  addition or mixed addition/subtraction within 100, with two-digit operands and
  results 0–99, **without regrouping**. It assesses three-choice answers with
  visible base-ten operands, not manipulating blocks or proving an algorithm.
  Models, hints, retries and skips stay distinct; model-only viewing is ungraded.
  Review is the default and does not advance new-learning mastery. Reading level,
  age and rocket completion do not place a learner into harder math. See
  [the arithmetic boundary](docs/DIGIT-ARITHMETIC.md).
- **Pippa:** the original three-round **Shape Studio** stays the default, with
  matching, optional AB and an ungraded shape choice. New **Pattern playground**
  offers four rounds at an explicit matching, AB, AAB, ABB or ABC level. Continuation
  uses visible grouped models. It does not assess rule discovery, copying,
  explanation or drawing, and produces no artwork/portfolio credit. Hints,
  models and retries mark support; nothing promotes difficulty automatically.
- **Nova:** **Sink or Float** and the four-round **Growing and changing** plant/
  butterfly picture lab remain. New **Sky picture detectives** offers four rounds
  of picture matching or comparison of a clearly made-up three-/four-day chart.
  These are fictional picture/chart observations, not real weather observations,
  forecasts, causes, climate knowledge or full science-standard mastery. Levels
  are chosen explicitly; model/hint/retry/skip observations stay distinct.
- **Tavi:** **What comes next?** has two fictional rounds, packing an art box and
  a toy bag. Two cards are the default; three or four are deliberate choices.
  Valid orders obey shown before/after constraints, including either order for
  the two middle items. Help, models, simpler tasks and retries mark support.
  This observes picture sequencing, not actual chores, self-care or family habits.
- **Milo:** **Beats and little pauses** separates generous-tolerance copying of
  two-to-four-beat patterns from fully untimed visual beat/pause matching. A
  guided example precedes a fresh independent task; extra replay/model/hint use
  marks support. Unmatched or unreliable timing remains exploration. Optional
  original synthesized sound is not required; no microphone or recordings are
  used. Neither route establishes hearing, motor ability or broad musical skill.
- **Globe and chalkboard:** the five-round beginner state adventure uses three
  outlines from eight states, with full 50-state and 11-country maps as explicit
  alternatives. The five-letter alphabet trail distinguishes physical-key
  matching from touch choices, without a typing-speed or phonics claim.
- **Seating:** eleven registered seats support sitting/standing, including the
  garden couch's visual book pose once the existing Reading Nook is open. Safe
  exits and clothing poses are part of the candidate. This is visual play: it
  does not log a book, reading time, lesson, mastery or progress/reward credit.

These small tasks can be starting points for **separately observed offscreen
practice**, with a grown-up as appropriate:

- Bundle ten straws, model joining/taking away, then use different numbers and
  invite the learner to move and explain the bundles and loose units.
- Lay out repeating blocks or paper shapes, then invite continuation, copying or
  an explanation. The app's shape-choice result does not establish those actions.
- Notice a real plant over several days; for weather, look safely through a window
  without looking at the sun and draw what is actually seen on different days.
- Arrange a real toy bag together and discuss which safe steps can change order.
  Do not infer independent daily-living ability from Tavi's fictional pictures.
- Copy a comfortable clap-and-pause pattern, or match drawn beat/pause cards with
  no timing demand. Keep participation comfortable and optional.

A parent can record what they actually observed. These suggestions are not app-
verified transfer, retention or automatic skill credit. See
[the full capability matrix](docs/CAPABILITIES.md) for content ceilings and support.

### Parent records and appearance

The candidate's **Delete records** action removes the selected learner's learning
records and photos while keeping the profile and avatar appearance. If the avatar
referenced a deleted inspiration photo, that reference is cleared. It is not
avatar deletion, account deletion or deletion at an AI provider. Existing opt-in
sync can propagate the changes; export first when appropriate, remembering that
JSON media IDs are not an embedded-media backup. Never test reset on real history.

**Teacher talk** now explicitly describes saved conversations and summaries,
including records with no transcript lines. It distinguishes optional AI chat
from the separately controlled voice/microphone services, sync and exports. This
copy change adds no retention control or universal device-only guarantee.

---

## Architecture

```
src/
  domain/      Pure TypeScript. No React, no three.js, no storage.
    curriculum/   8 domains, 21 strands, 100 tracked skills with standards alignments
    mastery/      evidence → mastery level (deterministic, testable rules)
    adaptive/     per-domain capability profiles, recommendations, start tiers
    lessons/      LessonRun (adaptive runner + scaffold ladder), lesson content
    reading/      book catalog with original comprehension questions
    interpretation/  ActivityInterpretationService: local rules + optional AI
    rewards/      reward catalog + unlock engine
    world/        WorldState derived from progress; milestone previews
    play/         the rug's dance & gym circuit: moves catalog, stations, 1 → 10 rules
    reports/      report generator (parent vs. family audience)
    teachers/     teacher personas, memory-aware openers, free conversation
                  (on-device understanding, AI adapter, prompts for the helper)
  data/        Storage adapters (IndexedDB, in-memory), schema, repositories, demo seed
  services/    Use cases: completeBook, saveActivity, recordLesson, createReport…
               Every learning event commits atomically via one UnitOfWork
               (records + mastery + reward unlocks).
  engine/      Imperative three.js game: world building, characters, camera,
               input, navigation, particles. Knows nothing about React or storage.
  ui/          React 19 UI: child mode (HUD, dialogue, lessons), parent studio,
               Learning Museum, home screen.
  app/         Composition root (dependency injection), router, live queries.
  audio/ voice/  Synthesized sound engine; speech output/input (on-device first).
scripts/ai-helper/  Optional AI helper (Node, no dependencies; local or AWS Lambda)
                    that keeps the API key and talks to OpenAI or Anthropic.
```

Boundaries are enforced by `npm run lint` (e.g. `domain` may not import
`react`/`three`/`services`; the engine may not import storage or React).

Key decisions (details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

- **Local-first.** IndexedDB with an in-memory fallback (private browsing shows
  a notice). `navigator.storage.persist()` is requested to avoid eviction.
- **Family sync** (hosted site, opt-in). `SyncingDatabase`
  (`src/data/storage/syncing.ts`) wraps the database: every write to a shared
  table is stamped (`_mod` = time.counter.device) and noted in `syncOutbox` in the
  same transaction; deletions leave tombstones. `SyncEngine` (`src/sync/`) sends
  the outbox and pulls others' changes from the helper's `/v1/sync` (overlapping
  window, paged), keeping the newest version of each record; photos travel
  separately. A never-used device adopts the family's school; one with its own
  records asks a parent. Server: `scripts/ai-helper/sync.ts` + `awsStore.ts`
  (DynamoDB with a conditional "newer wins" write and a by-change index; S3 for
  photos; SigV4, no SDK). `meta` stays on the device.
- **The world is a pure function of progress.** `deriveWorldState(snapshot,
  unlockedRewards)` decides what the 3D school contains. The engine only
  renders it, so milestone previews are just a hypothetical snapshot.
- **Evidence is the single source of truth.** Mastery is recomputed from
  evidence; parent assessments are stored as overrides next to (never instead
  of) the computed level.
- **Replaceable services.** Interpretation, book metadata, speech and storage
  sit behind interfaces injected at the composition root.
- **No heavy framework for the game.** three.js with procedural, toy-like
  geometry, static batching, quality presets and an automatic low-quality mode
  for software renderers.

### Data model (IndexedDB, schema v2 — v2 adds `syncOutbox`)

| Store | Key fields |
| --- | --- |
| `households` | name, settings (PIN, audio, voice, graphics, interpretation provider + consent, demo tools) |
| `parents` | displayName, role |
| `children` | name, birthDate?, status (active/inactive), avatarId, activePetId, explored (first-day discoveries) |
| `avatars` | skin/hair/eyes/outfit/colors/accessory, inspirationMediaId? (photo shared by opt-in family sync; no face analysis) |
| `books` | title, author, status, cover style, chapters/pages, reading mode, rating, favorite part, notes, tags, shelfIndex, photos |
| `readingSessions` | book, date, chapters/pages/minutes, mode, source (child/parent/interpreter) |
| `activities` | date, title, narrative, domains, skills, topics, nature items, media, reflection, interpretation provenance |
| `evidence` | skillId, observedAt, source, kind (performance/observation/exposure), trials {independent, supported, notYet}, independence, statement, excerpt |
| `mastery` | computedLevel, override?, stats, confidence, needsReview, history |
| `lessonAttempts` | lessonId, start/end tier, per-problem records (prompt, responses, scaffolds, outcome) |
| `teacherInteractions` | teacher, context, retained transcript turns (possibly empty), outcome/summary |
| `rewardUnlocks` | rewardId, unlockedAt, celebrated, trigger |
| `portfolio` | kind, title, description, media, skills, favorite (→ museum) |
| `media` | Blob (downscaled JPEG, EXIF stripped), caption |
| `reports` | audience, period, immutable content snapshot |

Every child-scoped store has a `childId` index; every query goes through it.
Deleting or exporting a child touches only that child's records.

### Mastery rules

| Level | Rule |
| --- | --- |
| Introduced | any evidence (including exposure) |
| Developing | at least one success (independent or supported) |
| Proficient | ≥3 independent successes on ≥2 days, recent accuracy ≥70% |
| Mastered | ≥6 independent successes on ≥3 days, recent accuracy ≥85%, last 3 attempts independent |

Exposure never contributes trials. Supported successes count half toward recent
accuracy and never toward proficiency. A skill that falls back after proficiency
is flagged for a gentle review.

---

## Curriculum

100 tracked skills across Reading, Math, Science (primary) and Writing, Vocabulary,
Reasoning, Life Skills and Creativity. Each skill has a parent-facing
"can …" statement, a kid-facing name, an internal difficulty (Pre-K … Grade 4),
prerequisites, topics that grow the world, an at-home activity idea and
standards references:

Common Core ELA · Common Core Math and mathematical practices · NGSS performance
expectations and DCIs · National Core Arts Standards · CASEL · Head Start ELOF.
These are catalog alignments, not evidence of complete standards coverage.

Standards codes and grade labels are **parent-only** (enforced by lint for child
UI). Capability is shown per domain and per strand — a learner can be "advanced" in
reading comprehension and "developing" in early math at the same time.
Recommendations pick skills just beyond the learner's demonstrated frontier whose
prerequisites are met, plus review for anything slipping. Those broad parent
catalog descriptors are not math placement tests. The added bounded activities
use their explicit level/goal choices; they do not infer math readiness from
reading proficiency or claim a grade-equivalent curriculum.

The book catalog contains 20 titles and 49 **original**
comprehension questions and "favorite moment" choices (no copyrighted text is
reproduced). Parents can add any book; unknown titles still work with generic
reflections; unknown book facts are not verified. The catalog is not a complete
reading curriculum, and catalog entries are not all playable lessons.

See [the source-verified capability matrix](docs/CAPABILITIES.md) for exact
activities, content ceilings, rewards and backup limits. Recompute the inventory
with `node --import tsx scripts/capabilities.ts`.

---

## Replacing the activity interpreter with an LLM

The default `LocalHeuristicInterpreter` (≈60 transparent rules, clause-level
independence, number words, measurements, dates, book matching) runs entirely
on the device. To use an LLM:

1. Stand up a small HTTPS proxy you control (it holds any API key — never put
   keys in the browser). It receives:

   ```json
   {
     "system": "…instructions…",
     "schema": { "…JSON schema for the response…": true },
     "catalog": [{ "id": "read.retell", "domain": "reading", "name": "…", "can": "…" }],
     "narrative": "Sample learner read two chapters…",
     "childFirstName": "Sample",
     "today": "2026-09-26"
   }
   ```

   and returns an object matching `INTERPRETATION_JSON_SCHEMA`
   (`src/domain/interpretation/remoteInterpreter.ts`): `title`, `date`,
   `skills[] {skillId, confidence, kind, independence, outcome, statement, excerpt}`,
   optional `topics`, `natureItems`, `followUps`.
2. In **Settings & privacy → Activity interpretation**, choose "My own AI
   endpoint", enter the URL (HTTPS, or `http://127.0.0.1…` for a helper on the
   same computer), and tick the explicit consent box.

**Easiest:** the bundled AI helper already implements this. With it running
(see *Talking to teachers*), use `http://127.0.0.1:8787/v1/interpret`.

Only the narrative text, first name and date are sent — no ids, photos or
history. Responses are validated (unknown skills dropped, values clamped); on
any error the app silently falls back to the on-device interpreter, and the
parent still reviews every suggestion before anything is saved. To plug in a
different provider in code, implement `ActivityInterpretationService` and
return it from `createInterpretationService`.

---

## Voice and teacher conversations

- **Output**: `SpeechOutput` uses browser `speechSynthesis` with per-teacher
  pitch/rate. The voice picker lists English voices marked `localService` and
  ranks available voices; ordinary speech can use the browser default when no
  listed voice is available. That fallback is not a guaranteed on-device voice.
  Contained `localOnly` lines require a listed local voice and otherwise remain
  text-only. Read-aloud depends on browser support, settings and playback; text
  remains visible, and generated speech is not proof that sound was heard.
- **Natural voices** (optional, OpenAI): `HelperSpeechOutput`
  (`src/voice/helperVoice.ts`) sends eligible lines to `/v1/speak`. The source
  default is `gpt-4o-mini-tts`, with a teacher voice/performance note; deployed
  provider configuration and live availability were not verified by the release checks.
  Cached audio can avoid another provider request, but cache misses, eviction or
  storage failures can require a new request. Cache keys currently use teacher
  and text, not model/configuration revisions. Failures attempt browser speech;
  cancellation suppresses stale playback. Turning natural voices off requests
  persistent-cache deletion, which can fail; it is not a provider-data deletion
  or a guarantee that all in-memory audio is erased. See
  [the separate voice migration plan](docs/VOICE_MIGRATION.md).
- **Name pronunciation**: Settings can save a pronunciation respelling
  (`Child.sayName`, with a preview) that `domain/pronounce.ts` uses only for
  speech. The displayed name and records are unchanged. Renaming a profile
  clears its pronunciation override.
- **Input**: `SpeechInput` (`BrowserSpeechInput`) wraps the Web Speech API,
  on-device first: `SpeechRecognition.available/install` + `processLocally`
  (tap-triggered checks in Settings or explicit microphone setup in child mode
  run behind a crash marker — `domain/talk.ts`, `services/talkService.ts`;
  child mode otherwise reads the saved answer),
  phrase biasing with the learner's book titles, live words while the learner talks, and clear
  reasons when it can't listen. `talkMode` is `device` (default — never falls
  back to a cloud recognizer), `browser` (parent allows the browser's service
  when on-device isn't available), `helper` (the family's AI helper — OpenAI
  `gpt-transcribe`: `HelperListener` records only while the mic button is on,
  stops after a short silence, and posts the clip to `/v1/listen` with the learner's book
  titles and, when supplied, first name as keyword/context hints) or `off`.
  `RoutingSpeechInput` selects the configured mode; a helper failure does not
  silently authorize another recognition service.
  **Which microphone** (`src/voice/microphones.ts`): a parent's choice in
  Settings, otherwise the default — except an iPhone/iPad Continuity mic, which
  is skipped for the built-in one. The browser recognizer gets it as a
  `MediaStreamTrack` (`start(track)`, Chrome 133+; falls back to its default),
  the helper recorder opens it directly. Settings has a live level meter.
  Helper listening buffers a recording in memory for transmission; the app does
  not persist microphone recordings in its learning records. Saved interactions
  may retain recognized text, which can be incomplete or misheard. Provider and
  browser-service retention is separate from local record storage.
- **Conversation**: `TeacherChatService` (`src/domain/teachers/chat.ts`).
  `LocalTeacherChat` understands book talk on-device; `HttpTeacherChat`
  (`chatRemote.ts`) calls the family's helper and validates/sanitizes every
  reply, falling back to local on any problem. Recognized sensitive conversations
  stay local for later teacher turns and read-aloud; full retained context is
  checked before outbound history is shortened. This cannot detect every concern
  or recall prior transmissions. Replies only *propose* actions; the learner confirms
  with a tap.
- **AI helper** (`scripts/ai-helper/`): a small Node server on `127.0.0.1`
  (or the AWS Lambda behind the site) with no dependencies. It keeps the key —
  `OPENAI_API_KEY` (replies, voices, listening; used when set) or
  `ANTHROPIC_API_KEY` (replies only); on AWS the OpenAI key is read from Secrets
  Manager with a signed request (`awsSecret.ts`). It builds the prompts
  (`src/domain/teachers/aiPrompt.ts`; OpenAI bodies in `openai.ts` — Responses
  API, forced function call, `reasoning: none`, `store: false`), allows only the
  family's page origins plus a custom header (forces a CORS preflight), caps body
  size, and rate-limits replies (20/min, `AI_DAILY_LIMIT`/day), voices and
  listening separately. Endpoints: `GET /health` (configuration flags, not a live provider test),
  `POST /v1/teacher`, `/v1/interpret`, `/v1/speak` (MP3), `/v1/listen`.
  `OPENAI_MODEL` (default `gpt-6-luna`) and `AI_MODEL` (default
  `claude-haiku-4-5-20251001`) pick the reply models.
- To use a different TTS/STT engine or AI provider, implement the interfaces in
  `src/voice/SpeechService.ts` / `src/domain/teachers/chat.ts` and inject them
  in `src/app/services.tsx`.

All sound effects and ambience are synthesized with Web Audio (no music files,
no copyrighted audio), with master/effects/ambience/voice volumes and mute.

---

## Assets & the Blender pipeline

Every 3D object is currently **procedural** (built from rounded primitives in
`src/engine/world/*` and `src/engine/characters/*`), and textures (floors, rugs,
posters, book covers, kid art) are painted on canvases at runtime. That keeps
the app tiny, license-clean and fully offline. Blender was not available in the
build environment, so no authored models are included yet.

To swap in authored models:

1. Model in Blender at 1 unit = 1 m, origin at the floor, facing −Z. Keep to a
   few materials; bake lighting details into textures; aim for < 5k triangles
   per prop and < 15k per character.
2. Export glTF 2.0 binary (`.glb`) with "+Y up", apply modifiers, include only
   selected objects. Compress textures to ≤ 1024².
3. Put files in `src/assets/models/` and import them
   (`import url from '../assets/models/owl.glb'` — the build already copies
   `.glb` files with hashed names), then load with three's `GLTFLoader` in the
   matching builder (e.g. replace `createTeacher('hoot')`). Static props should
   still be added through `ctx.addStatic` so they are batched.
4. Characters: keep the same public API (`update`, `wave`, `cheer`) so game logic
   doesn't change; use glTF animation clips via `AnimationMixer`.

Fonts are bundled locally (Fredoka, Nunito, Fraunces, Inter — SIL OFL), so no
font CDN is contacted.

---

## Privacy & safety

- Parent is the administrator; the studio is behind a PIN (a speed bump for
  little hands, not a security boundary against adults).
- Data can leave the device through parent-enabled family sync, optional
  AI/browser speech services, or parent exports. The hosted sign-in serves one
  household; it does not authorize other households. No analytics, ads, trackers,
  social features or public child profiles. The preview server sends a strict CSP (connections only to itself,
  the local helper, or a parent-configured https endpoint).
- **Talking**: the default `device` mode requests on-device recognition and does
  not enable cloud-recognizer fallback. Parent-enabled browser speech can send
  audio to the browser's service. Helper mode records a temporary clip and sends
  it to the helper/OpenAI with permitted name/book-title context. The app does
  not persist raw microphone recordings; this is not a promise about all browser
  or provider processing and retention.
- **AI teachers** (off by default, explicit consent): eligible replies send the
  learner's first name, current text, up to eight history turns and up to 20 book
  titles. Fixed helper profile assumptions remain; they are not assessments.
  The adapter does not attach photos, birthdays or record/report objects, but
  supplied text may itself contain personal information. Provider handling is
  governed separately from local storage. See the dated official-source review in
  [deployment privacy guidance](docs/DEPLOY.md#provider-data-handling-and-release-limits).
  `store: false`, parent consent and a successful deployment do not by themselves
  establish zero-data-retention eligibility or child-data compliance.
- **Natural voices** (off by default, OpenAI): the teachers' lines are sent to be
  spoken; Settings discloses that the voices are AI-generated.
  Safety rules live in the helper, replies are checked on-device before the learner
  sees them, recognized concerns are handled on-device and flagged for parents,
  and AI lines are marked in *Teacher talk*. Once a conversation is contained,
  subsequent teacher replies and read-aloud stay local, using local-service voices
  or visible text. Parent-enabled speech recognition can transmit audio before
  its words are known; existing sync/export behavior is unchanged. See
  [containment limits](docs/SAFETY-CONTAINMENT.md).
- No child-facing external links (lint-enforced).
- Photos are downscaled and re-encoded on upload, which strips EXIF/GPS. No face
  recognition or biometric processing (lint-enforced). The avatar "inspiration
  photo" is displayed beside the editor; features are chosen by hand. It is
  ordinary media and participates in parent-enabled family sync.
- *Teacher talk* shows saved activity outcomes/summaries and available transcript
  turns. Some records, including place-value summaries, have no transcript turns.
  This is not a word-for-word archive of every interaction. 🎤 marks recognized
  speech text, not an audio recording; “AI” marks retained AI-written lines.
- Settings can export one learner's records as JSON or delete learning records
  and photos while preserving the profile/avatar appearance. Exported media IDs
  are not a complete embedded-media backup or a supported restore flow.
- Sample data is only ever loaded on purpose, is labeled everywhere ("demo" tags and a banner), and can be cleared with *Start fresh*.

---

## Tests & quality checks

- **Unit/component tests** — AWS hosting (the edge sign-in function: welcome page, session cookies, sign-out; stack wiring, the Lambda adapter refusing traffic that skipped CloudFront), talking to teachers (synthetic and regression utterances,
  catalog/own-book title matching, yes/not-yet follow-ups, worries → parent
  notes, reply sanitizing and AI output validation, the browser adapter's
  fallbacks and data minimization, prompt building, the helper's CORS/header/
  key/size/rate-limit rules, on-device-first speech recognition with a fake
  recognizer, settings upgrade, reading-log notes), first launch (empty school, upgrade of older auto-seeded samples without touching real records, start fresh, chosen sample data), first-day discovery and first-meeting dialogue, mastery transitions and edge cases, reward unlocking at
  every milestone, world-state derivation, milestone previews, book completion
  (shelf slots, honest supported evidence, duplicate protection), activity
  classification on the spec's own examples (and false-positive guards),
  review/save with rejected suggestions, exposure never becoming mastery,
  multi-child separation (records, mastery, rewards, export, delete),
  persistence (IndexedDB close/reopen via fake-indexeddb + atomic commits),
  adaptive lessons (tier up/down, scaffold ladder, modeled answers),
  recommendations and per-domain profiles, reports (period filtering,
  family = no jargon), catalog integrity, and navigation/collision.
- **E2E (Playwright)** — the first day in a brand-new school (welcome card →
  meet Professor Hoot → finish the learner's first book, *Charlotte's Web*, with
  scaffolding → it flies onto the empty shelf → Pip the Bookworm → reload
  persistence → parent sees evidence, transcript and the getting-started
  checklist); parent flow (load sample data → natural-language entry →
  review → greenhouse unlock → curriculum evidence → family report → museum and
  tour) on desktop **and** a phone viewport, including a no-horizontal-overflow
  check; talking (a simulated on-device recognizer receives a book-completion
  utterance → Hoot answers about it → the learner confirms completion →
  onto the shelf → a typed worry reaches the parent's Today page → spoken
  lines marked in Teacher talk → Settings shows on-device ready and AI off).
- **Lint** — layering, privacy (no external links in child UI, no trackers,
  network calls restricted to the interpretation, teacher-chat, helper-voice
  and family-sync transport adapters), safety (no eval/innerHTML/`any`/
  `console.log`/localStorage), Prettier.

### Dependencies & provenance

Runtime: `react`, `react-dom` 19.2.6 and `three` 0.186.1 — nothing else ships
to the browser. Dev: TypeScript 6, esbuild, tsx, Prettier, Playwright,
fake-indexeddb (tests only). The build environment could not reach the npm
registry, so packages came from the environment's pre-installed toolchain and
local cache, three.js and fake-indexeddb from their official GitHub release
tags, and type definitions from DefinitelyTyped. All were checked for
install hooks (only esbuild's official binary-installer `postinstall`) and for
network/process access in runtime code. `package.json` pins the same versions,
so `npm install` reproduces them from npm on a normal machine.

---

## Known limitations

- Headless/software WebGL (SwiftShader) can run the 3D school at only a few frames
  per second; tests use `?maxfps=3` and reduced motion. Performance depends on the
  device; `?quality=low` can help. Milo's scoped rendering pause avoids background
  WebGL drawing during its DOM activity while world updates continue; it is not
  a universal input-latency or real-device performance guarantee.
- Art is procedural; no Blender-authored models yet (see pipeline above).
- The local interpreter is rule-based: good on common homeschool phrasing,
  conservative on ambiguity, and always reviewed by a parent — but it will miss
  unusual wording. The optional LLM endpoint is the upgrade path.
- On-device speech recognition needs a recent desktop Chrome (plus the one-time
  voice pack); elsewhere it's the browser's cloud service (parent opt-in) or
  typing. Speech recognition can mishear young speakers. The transcript stays visible,
  and titles are matched
  forgivingly.
- Without AI teachers, the on-device teachers understand book talk and simple
  feelings/questions, and answer anything else with a friendly generic reply.
- Data is local-first, with optional single-household sync on the hosted site.
  The child JSON export references media by ID and is not a whole-school media
  backup; a supported complete restore/import workflow is not shipped. Sync can
  propagate deletion and is not an independent versioned backup.
- The candidate has six teachers, eight directly registered lessons, book
  conversations, keyboard trails, globe modes and dedicated routine/rhythm flows.
  The 100-skill tracking catalog is much broader than the playable content; see
  [the capability matrix](docs/CAPABILITIES.md). Phonics, a drawing canvas,
  supported regrouping and new milestone/reward proposals remain outside it.
- The parent PIN is not encryption. Anyone with the device can read the data.

## Current backlog and release evidence

The [development roadmap (#12)](https://github.com/jeanbrianc/virtual-school/issues/12)
tracks bounded increments and remaining acceptance gates. Current live PR #42
contains #33/#34/#35/#36/#37/#38/#40/#46: chooser, beginner globe, Hoot stories,
usage visibility, place value, book-arrival camera, life-cycle pictures and
conversation containment. The candidate adds sanitized #39 documentation and
#41 patterns, #43 avatar-preserving record deletion, #44 Tavi routines, final
#45 Milo rhythm, #47 privacy copy, #48 weather, final #49 arithmetic and corrected
#50 seating. Already-live #37/#40/#46 are preserved, not counted as new deliveries.

Durable budgets (#25), voice migration (#26), broader teacher depth (#20–#24),
full music/life-skills acceptance (#13–#14), and external-family privacy,
isolation, provider-retention and pilot gates (#9–#11) remain open. Phonics,
drawing and new milestone/reward proposals are excluded; existing rewards stay.

Source integration, a passing test suite, owner approval and a deployed release
are separate facts. See [the release feature inventory](docs/RELEASE-INVENTORY.md)
for exact source checkpoints, dated baseline evidence and the combined-release
checklist. This candidate must receive its own final-head review and checks before
any approved publication, merge or deployment is described as complete.

### Keyboard trail

The alphabet above the chalkboard starts a five-letter matching trail. It begins
with A–E and expands toward Latin A–Z over completed rounds. All letters have
labeled touch alternatives. Physical matching uses `KeyboardEvent.key`, following
the device layout; upper/lowercase, Shift and Caps Lock work. Non-Latin input,
IME composition, repeated keys and Control/Command/Alt shortcuts are ignored.
There is no timer. Repeat, hint, skip, cancel and replay are available; switching
focus pauses the trail until Resume. World movement and camera controls pause.

Save explicitly after the five prompts. Cancelling or reloading an unfinished
trail saves nothing. Saving twice commits one atomic lesson with stable evidence
IDs; replay starts a separate run. Parent records list letters, hints, skipped
prompts and physical versus touch input. These are family-defined letter/key
familiarity skills, not reading mastery or typing speed. Touch recognition does
not count as physical keyboard proficiency. No global key history is stored.
