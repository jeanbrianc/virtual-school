# Release feature inventory

Checked October 17, 2026. A clean checkout must be compared with this inventory
before publication; never replace preserved work wholesale or use real learner
records to test a candidate.

## Verified history

| Feature | Merged source | Evidence and remaining limits |
| --- | --- | --- |
| Keyboard trail | PR #15 | Stable A–Z physical/touch modes; preserve input suspension and historical records. |
| Typed teacher registry | PR #16 | Hoot, Digit, Nova and Pippa; unknown/retired historical IDs remain readable. |
| Shape Studio and simpler first lessons | PR #17 / #18 | Preserve novice matching and explicit optional challenge. |
| Globe recovery | PR #28, merge `ac8e41ee1b7aaa7c52c4f0c384b0f521888d81ea` | 216 unit checks passed on the candidate. Original browser suite was blocked/unrun; #19 remains open for acceptance reconciliation. See GLOBE-RESTORATION.md. |
| Hoot history, phone choices and cancellation | PR #29, merge `35f00e92e43178bc8868a15c489dae4263905981` | Exact-head independent review and 236 unit/component tests passed; browser execution was then blocked. Preserve async invalidation. |
| Nook opening/furniture | PR #30, merge `1dea007c2b24038914908cd7f7554f6d46be9edc` | 240 unit tests and focused browser/pixel review. [Run 38309445820](https://github.com/jeanbrianc/virtual-school/actions/runs/38309445820) completed check, production/Lambda builds and Publish successfully. This earlier publication is retained as historical evidence. |
| Garden-themed nook | PR #31, merge `5e2aaf9dfff174501a07c6d5a028a10b68fed33f` | 241 unit tests and six desktop/phone garden browser scenarios reviewed before merge. [Run 39033705839](https://github.com/jeanbrianc/virtual-school/actions/runs/39033705839) passed checks, browser matrix and AWS Publish. Deployment review verified exact S3 HTML/ChildMode bytes, completed CloudFront invalidation and healthy public sign-in reload. This is the latest verified publication in this ledger. |

Current source baseline for the capability matrix is `5e2aaf9`. Pending draft
PRs are not included in shipped feature claims. Exact owner approval, merge
commit and final Publish evidence must be recorded for each later release.

## Preserved-source boundary

The globe port originated in a read-only preserved working tree at
`3b8be32fee44e4959289c322ba82c2bdbc5cfcc6`, integrated narrowly onto
`37172c3567e3ec2786f5f138ab8761c6294a74e9`. This documents source provenance, not
which historical release lost a feature. Natural Earth assets replaced map data
whose licensing lineage was not established.

The inventory explicitly excluded Bunny Picnic, reading feeling choices,
whole-school backup/import, sign-out, family sync notices and sync shutdown
changes. Later PR #29 independently delivered reading feeling controls. Do not
claim the other preserved slices are shipped, delete their originals, or upload
unrelated files. Each needs current-source comparison and an owner-scoped decision.

## Candidate release checklist

1. Record repository, clean base SHA, candidate SHA, changed-file inventory and
   linked issue acceptance criteria. Inspect latest main/open PRs for overlap.
2. Compare `node --import tsx scripts/capabilities.ts` and docs/CAPABILITIES.md.
   Verify all existing teacher routes, keyboard/Pippa input safety, globe modes,
   dance, parent navigation, progress/unlocks and single-household sync remain.
3. Run `npm run check` on the final code and relevant browser tests on desktop and
   phone. Inspect screenshots, 320/375/412 portrait and narrow landscape, reduced
   motion, unavailable audio/AI, cancellation/reopen/reload and repeated actions.
   Focused passes never imply the full suite passed.
4. Use only synthetic fixtures. Preserve stable IDs and previous records;
   distinguish independent/support/skips/observations. Test duplicate-save races
   and compatibility without resetting or uploading actual learner history.
5. Obtain independent review and owner acceptance. Keep incomplete broad issues
   open; describe remaining content, infrastructure and validation gaps.
6. Immediately before an approved merge, recheck exact-head CI and merge base.
   Merging main can trigger production publication. New account access, retention,
   resources or paid services require their own authorization.
7. After approved publication, verify build/source identity and actual Publish
   result. Read-back verification checks uploaded artifact bytes; neither it nor
   a green build proves every user flow. Inspect live behavior without modifying
   real records and record residual limits.
8. Record rollback/fallback steps appropriate to the change. Do not roll back a
   data schema blindly or rely on retired provider models after shutdown.

The current workflow makes garden desktop/phone tests part of its deploy
prerequisites. Other focused PR workflows must actually select their own tests
and phone project; a green unrelated browser job is not acceptance evidence.
