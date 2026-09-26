# Izzy's Virtual Classroom

A local-first 3D homeschool learning world for a young, advanced learner — plus a
parent studio for recordkeeping, curriculum tracking, portfolios and reports.

- **Child mode** — an explorable, cozy 3D school. Izzy walks around (keyboard,
  tap-to-walk, or a game controller), talks to her teachers (Professor Hoot for
  reading, Digit for math, Nova for science), finishes real books that fly onto
  her own bookshelf, and watches the school grow as she learns.
- **Parent studio** — describe the day in plain English ("we baked bread and she
  measured 2 cups of flour…") and the app suggests skills and evidence for you
  to review. Mastery, curriculum, portfolio, reports, and a word-for-word log of
  every teacher conversation.
- **Learning Museum** — a warm family showcase (with a TV-friendly guided tour)
  for grandparents and visitors.

Everything is stored in the browser on your device (IndexedDB). There are no
accounts, ads, analytics, trackers, social features or child-facing external links.

---

## Quick start

Requirements: **Node.js ≥ 20.10** and a modern browser (Chrome, Edge, Safari 17+, Firefox).

```bash
npm install          # installs pinned dependencies
npm run dev          # http://127.0.0.1:5173 with live reload
```

Open the app, tap **Izzy** to enter the school. The **Grown-ups** button asks for
the parent PIN — the demo PIN is **1234** (change it in *Settings & privacy*).

**Hosted copy.** The production build is also published as a private claude.ai
artifact. It runs the same code with its own browser storage. That viewer blocks
file downloads and the print dialog, so report download/print and JSON export
only work when you run the app locally (`npm run build && npm run preview`, or
serve `dist/` from any static host).

### All commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with live reload (esbuild) on port 5173 |
| `npm run build` | Production build → `dist/` (static files; host anywhere) |
| `npm run preview` | Serve `dist/` on http://127.0.0.1:4173 with a strict CSP |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | Architecture boundaries + privacy/safety rules + Prettier check |
| `npm test` | Unit tests (Node test runner + tsx), 68 tests |
| `npm run test:e2e` | Builds the e2e bundle and runs Playwright (desktop + phone) |
| `npm run check` | typecheck + lint + unit tests + production build |
| `npm run format` | Prettier write |

URL switches (handy on older machines or in CI): `?quality=low|balanced|high`,
`?maxfps=30`. Reduced-motion system settings skip the camera intro sweep.

Playwright needs a Chromium: `npx playwright install chromium` on a new machine
(or set `PLAYWRIGHT_BROWSERS_PATH` to an existing install).

---

## What works end to end

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
    reports/      report generator (parent vs. family audience)
    teachers/     teacher personas, memory-aware openers
  data/        Storage adapters (IndexedDB, in-memory), schema, repositories, demo seed
  services/    Use cases: completeBook, saveActivity, recordLesson, createReport…
               Every learning event commits atomically via one UnitOfWork
               (records + mastery + reward unlocks).
  engine/      Imperative three.js game: world building, characters, camera,
               input, navigation, particles. Knows nothing about React or storage.
  ui/          React 19 UI: child mode (HUD, dialogue, lessons), parent studio,
               Learning Museum, home screen.
  app/         Composition root (dependency injection), router, live queries.
  audio/ voice/  Synthesized sound engine; speech output/input interfaces.
```

Boundaries are enforced by `npm run lint` (e.g. `domain` may not import
`react`/`three`/`services`; the engine may not import storage or React).

Key decisions (details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

- **Local-first.** IndexedDB with an in-memory fallback (private browsing shows
  a notice). `navigator.storage.persist()` is requested to avoid eviction.
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

### Data model (IndexedDB, schema v1)

| Store | Key fields |
| --- | --- |
| `households` | name, settings (PIN, audio, voice, graphics, interpretation provider + consent, demo tools) |
| `parents` | displayName, role |
| `children` | name, birthDate?, status (active/inactive), avatarId, activePetId |
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
   endpoint", enter the HTTPS URL, and tick the explicit consent box.

Only the narrative text, first name and date are sent — no ids, photos or
history. Responses are validated (unknown skills dropped, values clamped); on
any error the app silently falls back to the on-device interpreter, and the
parent still reviews every suggestion before anything is saved. To plug in a
different provider in code, implement `ActivityInterpretationService` and
return it from `createInterpretationService`.

---

## Voice

- **Output**: `SpeechOutput` interface; the default uses the browser's built-in
  `speechSynthesis` with per-teacher pitch/rate. A speaker button reads any
  line; "read aloud automatically" is a parent setting. Text is always shown.
- **Input** (off by default): `SpeechInput` wraps the Web Speech API so Izzy can
  tell Professor Hoot her favorite part. The parent setting warns that browser
  recognition may send audio to the browser vendor. Tapping always works.
- To use a local/other TTS or STT engine, implement the interfaces in
  `src/voice/SpeechService.ts` and inject them in `src/app/services.tsx`.

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
- Data never leaves the device unless the parent configures and consents to an
  external AI endpoint. No accounts, analytics, ads, trackers, social features,
  or public profiles. The preview server sends a strict CSP.
- No child-facing external links (lint-enforced).
- Photos are downscaled and re-encoded on upload, which strips EXIF/GPS. No face
  recognition or biometric processing (lint-enforced). The avatar "inspiration
  photo" is only displayed beside the editor; features are chosen by hand.
- Every teacher conversation is stored word for word and visible in *Teacher talk*.
- Export a child's complete records as JSON, or delete them, from Settings.
- Demo data is labeled everywhere ("demo" tags and a banner) and can be reset.

---

## Tests & quality checks

- **Unit (68 tests)** — mastery transitions and edge cases, reward unlocking at
  every milestone, world-state derivation, milestone previews, book completion
  (shelf slots, honest supported evidence, duplicate protection), activity
  classification on the spec's own examples (and false-positive guards),
  review/save with rejected suggestions, exposure never becoming mastery,
  multi-child separation (records, mastery, rewards, export, delete),
  persistence (IndexedDB close/reopen via fake-indexeddb + atomic commits),
  adaptive lessons (tier up/down, scaffold ladder, modeled answers),
  recommendations and per-domain profiles, reports (period filtering,
  family = no jargon), catalog integrity, and navigation/collision.
- **E2E (Playwright)** — the complete core loop (enter → Hoot → finish
  *Charlotte's Web* with scaffolding → shelf/celebration → reload persistence →
  parent sees evidence and transcript); parent flow (natural-language entry →
  review → greenhouse unlock → curriculum evidence → family report → museum and
  tour) on desktop **and** a phone viewport, including a no-horizontal-overflow
  check.
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
- Speech recognition depends on browser support (Chrome/Edge/Safari).
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
