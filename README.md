# Izzy's Virtual Classroom

A local-first 3D homeschool learning world for a young, advanced learner — plus a
parent studio for recordkeeping, curriculum tracking, portfolios and reports.

- **Child mode** — an explorable, cozy 3D school. Izzy walks around (keyboard,
  tap-to-walk, or a game controller), talks to her teachers (Professor Hoot for
  reading, Digit for math, Nova for science) — by tapping, typing, or just
  saying it out loud — finishes real books that fly onto her own bookshelf, and
  watches the school grow as she learns.
- **Parent studio** — describe the day in plain English ("we baked bread and she
  measured 2 cups of flour…") and the app suggests skills and evidence for you
  to review. Mastery, curriculum, portfolio, reports, and a word-for-word log of
  every teacher conversation.
- **Learning Museum** — a warm family showcase (with a TV-friendly guided tour)
  for grandparents and visitors.

Everything is stored in the browser on your device (IndexedDB). On the family's own
hosted site, **family sync** (opt-in) keeps every signed-in device's school the same
through the family's own AWS account. There are no accounts, ads, analytics,
trackers, social features or child-facing external links.

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

Open the app and tap **Izzy**. The first launch is a brand-new, empty school:
no books, no history, nothing unlocked. Everything she can touch sparkles until
she discovers it, and her teachers introduce themselves the first time they
meet. The **Grown-ups** button asks for the parent PIN — it starts as **1234**
(change it in *Settings & privacy*).

Want to see how things look after a few weeks? *Settings & privacy → Load
sample data* replaces everything with a clearly labeled example history;
*Start fresh* clears learning records again (names, avatars and settings stay).

### Talking to teachers (and optional AI teachers)

**Talk-to-text** is on by default in *on-device only* mode: Izzy taps the
microphone and says “I read Daddy the Goodnight Leelanau book”; her words
appear, Professor Hoot answers about *that* book, asks whether she read the
whole thing, and offers **Put it on my shelf!** (the reading log notes “Izzy
read it aloud to Daddy”). Current desktop Chrome recognizes speech entirely on
the computer. The microphone button is always there (unless a parent turns
talking off); Izzy's **first tap** sets it up — it asks the browser about
on-device listening and downloads the voice pack if needed (a one-time ~60 MB
download from the browser, so the first tap can take a minute), and Chrome asks
once for microphone permission. *Settings & privacy → Talking to teachers* has
the same steps (**Check this browser**, **Download the voice pack**) plus
**Test the microphone**. Some browser builds crash the tab when asked about
on-device listening, so that question is only asked on a tap, behind a saved
marker that remembers a crash. In browsers without on-device recognition (Safari,
Firefox, older Chrome) either pick *Also allow the browser's speech service*
(the browser maker — Apple or Google — then hears the audio) or she can type.

**AI teachers** are off by default. The built-in teachers already understand
book talk (which book, who she read with, finished or not) without any network.
To let an AI model answer anything she says (and, with OpenAI, give the teachers
natural voices and better listening):

```bash
cp .env.example .env.local     # then paste your key after OPENAI_API_KEY= (or ANTHROPIC_API_KEY=)
npm run dev                    # also starts the AI helper on http://127.0.0.1:8787
```

Then *Settings & privacy → AI teachers*: **Check connection**, tick the consent
box, and **Turn on AI teachers**. The key stays in `.env.local` on your computer
(git-ignored) and never reaches the browser; the helper builds the teachers'
instructions itself, only answers pages on this computer, and has a daily cap
(`AI_DAILY_LIMIT`, default 300 replies ≈ well under a dollar a day with the
default Claude Haiku 4.5 model). See [Privacy & safety](#privacy--safety) for
exactly what is sent.

**Check connection** confirms provider configuration; it does not prove that
speech requests succeed. **Voice → Test natural voice** sends a short sample
without child information, uses a small amount of API credit, and provides a
play control when generation succeeds. Quota or rate-limit failures show
recovery guidance; teacher read-aloud falls back to built-in voices.

The classroom uses softer direct light and restrained glow so both rugs retain
their colors and numbered stations remain readable across graphics settings.

### Your own domain (AWS)

`npm run deploy:aws` puts the school on your AWS account at
**lms.brianjeanbuilds.com** — private S3 + CloudFront with HTTPS, a branded
welcome page with a family sign-in in front of everything, and the AI teachers as a small Lambda at
`/api` — for roughly the cost of the Route 53 zone you already have. After that,
every push to `main` on GitHub deploys itself. Step by step:
[docs/DEPLOY.md](docs/DEPLOY.md).

GitHub's AWS deploy role matches this repository's immutable numeric owner and
repository IDs plus the `main` branch. If copying the deployment to another
repository, also set its `GITHUB_OWNER_ID` and `GITHUB_REPO_ID`; see the deploy guide.

**Hosted copy.** The production build is also published as a private claude.ai
artifact. It runs the same code with its own browser storage. That viewer blocks
file downloads, the print dialog and the microphone, and can't reach the local
AI helper — so talking out loud, AI teachers, report download/print and JSON
export only work when you run the app locally (`npm run build && npm run preview`, or
serve `dist/` from any static host).

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
| `npm test` | Unit tests (Node test runner + tsx), 117 tests |
| `npm run test:e2e` | Builds the e2e bundle and runs Playwright (desktop + phone) |
| `npm run check` | typecheck + lint + unit tests + production build |
| `npm run format` | Prettier write |

URL switches (handy on older machines or in CI): `?quality=low|balanced|high`,
`?maxfps=30`. Reduced-motion system settings skip the camera intro sweep.

Playwright needs a Chromium: `npx playwright install chromium` on a new machine
(or set `PLAYWRIGHT_BROWSERS_PATH` to an existing install).

---

## What works end to end

0. **First day.** A welcome card, then ✨ sparkles on every teacher and object.
   Touching something the first time explains what it does (the empty
   bookshelf, Digit's launch pad, the locked greenhouse with its progress…); a
   🧭 counter tracks discoveries and finding everything earns a "School
   Explorer" cheer. Books appear only when Izzy tells Hoot about them or a
   parent adds them.
1. **Talk to a teacher.** Every teacher conversation has a microphone and a
   “type it” box. Hoot works out which book she means (her own list first,
   then a catalog of well-known titles — “frog and toad” → *Frog and Toad Are
   Friends*), who she read with, and whether she finished; “yes” / “not yet”
   answers carry on about the same book, and the next step is always a big
   button (*Put it on my shelf!*, *Bookmark it!*). Digit and Nova chat before
   their lessons (“let's go!” starts one). Worries (“my tummy hurts”, “someone
   hit me”) always get the same on-device answer — *please go tell Mom or Dad
   right now* — and a note on the parent's Today page.
1. **Enter school → walk → library → Professor Hoot.** Arrow keys/WASD, tap/click
   to walk (A* pathfinding around furniture), or a gamepad. Big glowing markers
   and a prompt show what's interactive.
2. **Finish a book.** Pick a book from her list, or type a new title (she reads at a 3rd-grade level; matching titles are suggested). Hoot asks
   1–3 comprehension questions — difficulty adapts to her reading level. A wrong
   tap gets "Almost! Let's try another way." and a scaffold ladder (hint →
   simpler stepping-stone → different explanation → modeled answer), never a
   penalty. Then a feeling, a star rating and her favorite part.
3. **The book flies to the shelf** in a short cinematic; the HUD counter ticks
   up. At 10 books a second bookshelf rises; 25 opens a reading nook; 50 the grand
   library; 100 hatches Ember the Book Dragon.
4. **Progress & rewards** are recomputed atomically with the new evidence.
   Rewards are only ever earned by learning — no currencies, loot boxes, timers
   or streak punishment.
5. **The world reacts**: plants → greenhouse, dinosaurs → fossil & skeleton,
   space → telescope & planet mobile, nature walks → nature table, artwork →
   art line & studio, Digit's missions → a rocket that is built stage by stage.
6. **Parent studio** shows the book, the per-question evidence (independent vs.
   with a hint), mastery changes and the full conversation transcript.
7. **Natural-language entry** → review/edit each suggested skill, outcome and
   independence → save. Evidence, portfolio, books and reward progress update;
   anything unlocked is celebrated next time she enters her school.
8. **Reports**: homeschool record (evidence, levels, standards) or family update
   (warm, photo-friendly, no jargon). Print/PDF, download as a self-contained
   `.html`, or copy text for an email.
9. **Persistence**: all of the above survives reloads (IndexedDB), and multiple
   open tabs stay in sync.

**Dance & gym circuit.** The 1–10 numbers on the classroom rug are stations,
like the circuits in her dance and gymnastics classes. Hopping onto a number
(walking, tapping it, or Space on the one she's on) makes her avatar do that
number's move — a plié, bunny hops, a ☀️ sunshine twirl, a star jump, a
curtsey, an arabesque, a cartwheel, a frog jump, a backflip and a ta-da by
default, from 17 moves. Each number plays the next note up a scale. The
striped flag in the aisle beside the rug (or just stepping on 1) starts "the circuit": a
glowing ring and a bouncing star show the next number, a HUD counts 1 → 10,
and finishing all ten in order gets confetti and is saved (`circuitsDone`).
Digit calls out each station ("Three! Sunshine twirl! Next, number four!")
when read-aloud is on. In the Parent Studio, **Avatar → Dance & gym circuit**
picks the move for each number, what she calls it in class ("sunshine arms"),
and previews any move on the avatar. The moves are procedural poses on the
avatar rig (`engine/characters/moves.ts`), so they work with any outfit.

Digit's **Moon Rock Rescue** (counting → comparing → add/subtract within 10 and
20 → word problems → equal sharing/groups) and Nova's **Sink or Float?**
(predict → test → observe → explain → generalize) are full adaptive lessons.

---

## Architecture

```
src/
  domain/      Pure TypeScript. No React, no three.js, no storage.
    curriculum/   8 domains, 21 strands, 78 skills with standards alignments
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
| `avatars` | skin/hair/eyes/outfit/colors/accessory, inspirationMediaId? (local only) |
| `books` | title, author, status, cover style, chapters/pages, reading mode, rating, favorite part, notes, tags, shelfIndex, photos |
| `readingSessions` | book, date, chapters/pages/minutes, mode, source (child/parent/interpreter) |
| `activities` | date, title, narrative, domains, skills, topics, nature items, media, reflection, interpretation provenance |
| `evidence` | skillId, observedAt, source, kind (performance/observation/exposure), trials {independent, supported, notYet}, independence, statement, excerpt |
| `mastery` | computedLevel, override?, stats, confidence, needsReview, history |
| `lessonAttempts` | lessonId, start/end tier, per-problem records (prompt, responses, scaffolds, outcome) |
| `teacherInteractions` | teacher, context, full transcript, outcome |
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

78 skills across Reading, Math, Science (primary) and Writing, Vocabulary,
Reasoning, Life Skills and Creativity. Each skill has a parent-facing
"can …" statement, a kid-facing name, an internal difficulty (Pre-K … Grade 4),
prerequisites, topics that grow the world, an at-home activity idea and
standards references:

Common Core ELA (29) · Common Core Math (22 + practice) · NGSS performance
expectations (18) and DCIs · National Core Arts Standards · CASEL · Head Start ELOF.

Standards codes and grade labels are **parent-only** (enforced by lint for child
UI). Capability is shown per domain and per strand — Izzy can be "advanced" in
reading comprehension and "developing" in early math at the same time.
Recommendations pick skills just beyond her demonstrated frontier whose
prerequisites are met, plus review for anything slipping.

The book catalog contains 15 real children's books with **original**
comprehension questions and "favorite moment" choices (no copyrighted text is
reproduced). Parents can add any book; unknown titles still work with generic
questions.

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
     "narrative": "Izzy read two chapters…",
     "childFirstName": "Izzy",
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

- **Output**: `SpeechOutput`; the default uses the browser's `speechSynthesis`
  with per-teacher pitch/rate and **only voices built into the computer**
  (network voices would send the text away). A speaker button reads any line;
  "read aloud automatically" is a parent setting, and when she talks by voice
  the teacher answers out loud. Text is always shown. The automatic voice
  prefers a clear US voice (never the joke/robot ones); a parent can choose
  another in *Settings → Voice*.
- **Natural voices** (optional, OpenAI): `HelperSpeechOutput`
  (`src/voice/helperVoice.ts`) sends each line to the helper's `/v1/speak`
  (`gpt-4o-mini-tts`, a voice and performance note per teacher in
  `TEACHERS[…].naturalVoice`), plays the MP3, keeps lines in Cache Storage so
  repeats are free, and falls back to the built-in voice on any problem.
  Turned on in *Settings → Voice*; turning it off clears the saved lines.
- **Her name, said right**: computer voices guess names from spelling
  ("EYE-zee"). *Settings → Voice → How the voices say "Izzy"* saves a
  respelling (`Child.sayName`, e.g. "Izzee", with *Hear it* and suggestions)
  that `domain/pronounce.ts` swaps in **only for speech**; the screen, records
  and AI teachers keep her real name. Renaming her clears it.
- **Input**: `SpeechInput` (`BrowserSpeechInput`) wraps the Web Speech API,
  on-device first: `SpeechRecognition.available/install` + `processLocally`
  (the `available()` probe runs only from Settings behind a crash marker —
  `domain/talk.ts`, `services/talkService.ts`; child mode reads the saved answer),
  phrase biasing with her book titles, live words while she talks, and clear
  reasons when it can't listen. `talkMode` is `device` (default — never falls
  back to a cloud recognizer), `browser` (parent allows the browser's service
  when on-device isn't available), `helper` (the family's AI helper — OpenAI
  `gpt-transcribe`: `HelperListener` records only while the mic button is on,
  stops after a short silence, and posts the clip to `/v1/listen` with her book
  titles as keyword hints) or `off`. `RoutingSpeechInput` picks the recognizer.
  **Which microphone** (`src/voice/microphones.ts`): a parent's choice in
  Settings, otherwise the default — except an iPhone/iPad Continuity mic, which
  is skipped for the built-in one. The browser recognizer gets it as a
  `MediaStreamTrack` (`start(track)`, Chrome 133+; falls back to its default),
  the helper recorder opens it directly. Settings has a live level meter.
  Audio is never stored; only the words are kept, in the transcript.
- **Conversation**: `TeacherChatService` (`src/domain/teachers/chat.ts`).
  `LocalTeacherChat` understands book talk on-device; `HttpTeacherChat`
  (`chatRemote.ts`) calls the family's helper and validates/sanitizes every
  reply, falling back to local on any problem. Worries are answered on-device
  and never sent. Replies only *propose* actions; she confirms with a tap.
- **AI helper** (`scripts/ai-helper/`): a small Node server on `127.0.0.1`
  (or the AWS Lambda behind the site) with no dependencies. It keeps the key —
  `OPENAI_API_KEY` (replies, voices, listening; used when set) or
  `ANTHROPIC_API_KEY` (replies only); on AWS the OpenAI key is read from Secrets
  Manager with a signed request (`awsSecret.ts`). It builds the prompts
  (`src/domain/teachers/aiPrompt.ts`; OpenAI bodies in `openai.ts` — Responses
  API, forced function call, `reasoning: none`, `store: false`), allows only the
  family's page origins plus a custom header (forces a CORS preflight), caps body
  size, and rate-limits replies (20/min, `AI_DAILY_LIMIT`/day), voices and
  listening separately. Endpoints: `GET /health` (provider + what works),
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
- Data never leaves the device unless the parent turns on and consents to an
  AI service. No accounts, analytics, ads, trackers, social features, or public
  profiles. The preview server sends a strict CSP (connections only to itself,
  the local helper, or a parent-configured https endpoint).
- **Talking**: by default her voice is recognized on the computer and the audio
  is never recorded, stored or sent. Only if a parent picks *Also allow the
  browser's speech service* may the browser send audio to Google/Apple, or
  *Your AI helper (OpenAI)* — then her clip (only while the mic is on) goes to
  the helper and OpenAI, which keeps no copy of transcription audio.
- **AI teachers** (off by default, explicit consent): for each reply the helper
  sends the AI service (OpenAI or Anthropic) her first name, what she said
  (text), the last few lines of that conversation and her book titles (the
  helper's instructions add that she's a young child who reads well above her
  age) — never photos, birthdays, records or reports. Neither trains on API data
  by default; OpenAI keeps reply and voice requests up to 30 days for abuse
  monitoring unless the organization has zero data retention, which OpenAI asks
  for before processing data of children under 13 (see docs/DEPLOY.md).
- **Natural voices** (off by default, OpenAI): the teachers' lines are sent to be
  spoken; Settings discloses that the voices are AI-generated.
  Safety rules live in the helper, replies are checked on-device before she
  sees them, worries are handled on-device and flagged for parents, and AI
  lines are marked in *Teacher talk*.
- No child-facing external links (lint-enforced).
- Photos are downscaled and re-encoded on upload, which strips EXIF/GPS. No face
  recognition or biometric processing (lint-enforced). The avatar "inspiration
  photo" is only displayed beside the editor; features are chosen by hand.
- Every teacher conversation is stored word for word and visible in *Teacher talk* (🎤 marks spoken lines, “AI” marks AI-written replies).
- Export a child's complete records as JSON, or delete them, from Settings.
- Sample data is only ever loaded on purpose, is labeled everywhere ("demo" tags and a banner), and can be cleared with *Start fresh*.

---

## Tests & quality checks

- **Unit (117 tests)** — AWS hosting (the edge sign-in function: welcome page, session cookies, sign-out; stack wiring, the Lambda adapter refusing traffic that skipped CloudFront), talking to teachers (the user's own example sentence,
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
  meet Professor Hoot → finish her first book, *Charlotte's Web*, with
  scaffolding → it flies onto the empty shelf → Pip the Bookworm → reload
  persistence → parent sees evidence, transcript and the getting-started
  checklist); parent flow (load sample data → natural-language entry →
  review → greenhouse unlock → curriculum evidence → family report → museum and
  tour) on desktop **and** a phone viewport, including a no-horizontal-overflow
  check; talking (a simulated on-device recognizer hears “i read daddy the
  goodnight leelanau book” → Hoot answers about it → “yes the whole thing” →
  onto the shelf → a typed worry reaches the parent's Today page → spoken
  lines marked in Teacher talk → Settings shows on-device ready and AI off).
- **Lint** — layering, privacy (no external links in child UI, no trackers, no
  network calls outside the AI adapter), safety (no eval/innerHTML/`any`/
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

- Headless/software WebGL (SwiftShader) runs the 3D school at a few frames per
  second; tests use `?maxfps=3` and reduced motion. Real GPUs (including
  integrated laptop GPUs and iPads) are smooth; `?quality=low` helps old devices.
- Art is procedural; no Blender-authored models yet (see pipeline above).
- The local interpreter is rule-based: good on common homeschool phrasing,
  conservative on ambiguity, and always reviewed by a parent — but it will miss
  unusual wording. The optional LLM endpoint is the upgrade path.
- On-device speech recognition needs a recent desktop Chrome (plus the one-time
  voice pack); elsewhere it's the browser's cloud service (parent opt-in) or
  typing. Recognizers are tuned for adults, so a 3-year-old's words are
  sometimes misheard — she always sees what was heard, and titles are matched
  forgivingly.
- Without AI teachers, the on-device teachers understand book talk and simple
  feelings/questions, and answer anything else with a friendly generic reply.
- Data lives in one browser profile. Use *Export* for backups; there is no sync
  between devices yet.
- Only two adaptive lessons (math, science) plus book conversations exist today;
  the curriculum and engine are ready for more.
- The parent PIN is not encryption. Anyone with the device can read the data.

## Next priorities

1. More lessons: phonics/decoding games with Hoot, place value with Digit,
   life-cycle and weather labs with Nova; writing/drawing canvas.
2. Encrypted backup/restore file (and optional family-owned sync).
3. Blender-authored teacher and pet models with animation clips.
4. Parent weekly planner that turns recommendations into a gentle schedule.
5. Georgia's early-years track (board books, songs, sensory play) when she's ready.
6. PWA install + offline service worker.
