# Hoot story conversations: bounded starter expansion

Issue #22, increment 1. This is a draft content/implementation review, not an
educator certification or a complete reading curriculum. No phonics activity is
included in this increment; its route depends on the shared chooser in #20.

## What ships

- 20 catalog titles and 49 original multiple-choice questions in total.
- This increment adds five titles and 20 questions (four per title), each checked
  against the original English story linked below. The previous 15 IDs and 29
  questions are retained; they have not all been independently re-audited here.
- Each new bank has two detail questions, one sequence question and one
  evidence-based inference. Questions, answer choices, hints, explanations and
  short favorite-part labels are newly written for the app. No book passages,
  illustrations, cover scans, recordings or publisher marketing copy are bundled.
- Existing original canvas cover motifs are reused. No remote content provider,
  service, account, credential, audio asset or runtime fetch is added.

## Sources and question review

Reviewed against the primary story text on 2026-10-17. Each catalog entry retains
its exact source URL, edition note, review date and parent-visible content note.
Title and author come from each source's title page. Page counts and chapter
counts are omitted for these titles because editions vary. The parent-facing
band is an editorial read-aloud suggestion, not a measured reading level.

### The Tale of Tom Kitten — Beatrix Potter (1907)

[Primary text, Project Gutenberg #14837](https://www.gutenberg.org/cache/epub/14837/pg14837-images.html)

- tom-kitten.q1, detail: Mr. Drake puts on Tom's fallen clothes.
- q2, sequence: washing/dressing precedes garden play.
- q3, inference: Tom struggles to move and climb in his clothing; that supports
  the explanation that the clothing gets in his way.
- q4, detail: the kittens sit on the garden wall.
- Parent preview note: the mother smacks the kittens. The app does not endorse
  physical punishment or ask children to approve it.

### The Tale of Benjamin Bunny — Beatrix Potter (1904)

[Primary text, Project Gutenberg #14407](https://www.gutenberg.org/cache/epub/14407/pg14407-images.html)

- benjamin-bunny.q1, detail: Peter's coat and shoes are on a scarecrow.
- q2, sequence: the rabbits retrieve the clothes, then collect onions.
- q3, inference: a cat on the basket prevents a safe exit from their hiding place.
- q4, detail: Benjamin's father removes the cat from the basket.
- Parent preview note: danger from a cat and an adult rabbit hitting the young
  rabbits. Questions avoid endorsing the adult's response.

### The Tale of Mrs. Tiggy-Winkle — Beatrix Potter (1905)

[Primary text, Project Gutenberg #12103](https://www.gutenberg.org/cache/epub/12103/pg12103-images.html)

- mrs-tiggy-winkle.q1, detail: Lucie has lost handkerchiefs and a pinafore.
- q2, sequence: after tea, the clothes are bundled for their return journey.
- q3, inference: prickles under the cap foreshadow the hedgehog reveal.
- q4, detail: Mrs. Tiggy-Winkle washes and irons the animals' clothes.
- The story's dream/reality ambiguity is deliberately not graded.

### The Tale of Squirrel Nutkin — Beatrix Potter (1903)

[Primary text, Project Gutenberg #14872](https://www.gutenberg.org/cache/epub/14872/pg14872-images.html)

- squirrel-nutkin.q1, detail: the squirrels cross the lake on twig rafts.
- q2, sequence: gifts and requests for permission precede gathering nuts.
- q3, inference: Old Brown's closed door and disgust support that the teasing
  bothers him. This is an inference from actions, not a diagnosis.
- q4, detail: Old Brown is an owl.
- Parent preview note: threats and the loss of part of Nutkin's tail.

### The Tale of Jemima Puddle-Duck — Beatrix Potter (1908)

[Primary text, Project Gutenberg #14814](https://www.gutenberg.org/cache/epub/14814/pg14814-images.html)

- jemima-puddle-duck.q1, detail: Jemima seeks a nesting place away from the farm.
- q2, sequence: she gathers herbs/onions before explaining her visits to Kep.
- q3, inference: the ingredients for roast duck point to the fox's dangerous
  intention. The text supplies this clue; the answer is not invented.
- q4, detail: Kep asks about the house and shed.
- Parent preview note: the fox plans to eat Jemima; dogs eat her eggs.

These books are optional catalog search results, not automatically assigned
lessons. Parents should preview their edition and decide suitability. Abridgments
and adaptations may omit or change details; skip a question that doesn't match
what the family read. Free reflection remains available for any custom title.

## Rights and provenance limits

The linked Project Gutenberg editions label these texts public domain in the
USA and include their own reuse terms. That is not a worldwide rights clearance;
local law and new editions/translations/illustrations can differ. This change
uses links for provenance and factual checks rather than redistributing those
editions. It claims no author, estate, publisher or Project Gutenberg endorsement.
The app's original questions remain under the repository's existing UNLICENSED
status; this contribution does not grant a new open-content license. Future
content imports must be reviewed separately.

## Selection and evidence contract

Parent Settings → Hoot's story conversations has a household-level choice:
Suggested from practiced skills (legacy adaptive default), Gentler, or Deeper.
The child sees no grade or difficulty rating. Each completion offers up to two
questions. Selection is deterministic:

1. Unanswered questions first, then least-recently answered questions.
2. Within equal freshness, prioritize the selected literal/detail/sequence or
   inference/meaning group.
3. Within that group, prioritize skills needing review, then emerging/practiced
   skills, then new skills, then proficient skills. Original catalog order breaks
   ties. Depth is a priority, not a guarantee that every question has one type.

History reads exact `[story-question:<stable-id>]` markers in system-generated
book evidence excerpts. It checks book ID, catalog ID, child ID and skill ID.
The save path emits a marker only for an exact matching built-in ID, prompt and
skill. Neither book titles nor legacy quoted prose are guessed as question IDs.
No historical evidence is rewritten or reassessed. Old histories without markers
start a new rotation. Skipped-only questions produce no comprehension evidence
and may be offered again; the UI never treats a skip as failure.

Hints count as supported. Sequence choices assess sequence recognition only,
not oral/written narration. New arbitrary narration is a zero-trial observation:
accuracy and independence were not assessed. It cannot add independent or
supported mastery successes. Historical narration records remain untouched.
The evidence taxonomy's conservative `assisted` value accompanies the explicit
unassessed statement; no assessed performance is inferred from it.

Custom titles offer feelings, favorite parts and typed narration with an explicit
ungraded label. Parent Books → a custom book → Details optionally stores one
bounded factual prompt and reference answer. Both are labeled parent-authored;
children may reveal the answer or skip. The response is saved in the conversation
without automatic correctness or mastery scoring. Clear both fields and save to
remove it. The optional fields travel through existing household/book sync only
when the family has enabled it; no new network destination is added.

AI teacher replies, when separately enabled with the existing consent, show
“book facts are unverified” and never become story-question evidence. The reviewed
bank, parent prompt and reflection paths all work without AI or audio. Reading
aloud a prompt can use existing voices; seeing a choice never claims listening,
phonics, oral reading or fluency evidence.

## Ceiling and remaining issue #22 work

This is two multiple-choice prompts per completion, not a general comprehension
test. Older banks still contain only 1–3 questions; rotation cannot manufacture
additional verified content. Families supply books, reading partners, instruction,
feedback on free narration and suitability decisions. Reading logs/completion
remain self/parent-reported. The app does not assess decoding, pronunciation,
reading rate, prosody, general fluency, dyslexia or a full reading curriculum.

Remaining: the separate offline phonics lesson, declared letter/sound and CVC set,
reviewed audio or accessible alternatives, shared-chooser route, and evidence
separation for letter names, keyboard matching, sounds and blending. These are
not claimed complete by this PR.

## Owner acceptance and verification

Use synthetic records only:

1. In Parent Settings choose each depth; reload and confirm it persists.
2. Select a new title explicitly and compare its four questions to the linked
   original. Decide whether the parent content warning is adequate for the family.
3. Complete two questions, using a hint on one. Check parent evidence and return
   after reload to confirm the other prompts are offered. Try skip and cancel.
4. Add a synthetic custom book in Parent Books, write a factual prompt/reference
   answer, and try a different child response. Confirm it is ungraded.
5. Log a favorite and narration without mic/AI; confirm a zero-trial observation,
   retained rating/progress, and exactly one completion on repeated taps.
6. Reopen/back/close during mic preparation and saving; confirm no stale result
   saves into a replacement conversation. Confirm siblings have separate history.

Automated coverage lives in `story-conversations.test.ts`, the extended
`hoot-cancellation.test.ts`, `story-conversations.spec.ts`, and existing Hoot,
core-loop, persistence and sync regressions. See the PR for exact-head check
results; local browser launch is blocked in the executor by its Unix-socket
restriction, so hosted Chromium CI supplies browser evidence. The browser workflow
has read-only repository permissions and never deploys.
