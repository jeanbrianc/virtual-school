# Globe restoration candidate (issue 19)

Recovered from a read-only preserved working tree based on `3b8be32fee44e4959289c322ba82c2bdbc5cfcc6`, integrated narrowly onto verified remote main `37172c3567e3ec2786f5f138ab8761c6294a74e9`. This establishes local source provenance, not which historical release omitted the feature.

The globe opens a Nova discovery card and an offline five-round adventure. US states is introductory; world countries is explicitly harder and limited to eleven reviewed targets. Map shapes and a labeled list support pointer, keyboard and touch. Read-aloud is optional and follows existing family speech settings. Hints identify the target through text and a thick outline; retries/hints are supported outcomes. Skip saves a skipped observation. Cancel retains already saved rounds; reopening starts a new session. Save failures keep the current round available for retry. Completion is counted only after five rounds, including explicit skips. No geography mastery or curriculum evidence is generated: the legacy geography identifiers remain observation objective IDs.

`globe-states`, `globe-countries`, `geography.states`, `geography.countries`, and teacher `nova` are retained. Optional `LessonAttempt.complete` preserves historical records without that field; false excludes partial sessions from completion totals. Unknown/retired IDs remain readable. Stable session/round IDs and atomic revision guards prevent duplicate and stale concurrent local saves. Existing family sync transports these lesson records using its unchanged reconciliation behavior. Concurrent offline edits on different devices retain the existing sync conflict semantics; this change does not claim a cross-device merge redesign.

See `src/domain/geography/README.md` for public-domain map source/license and projection limitations. Both preserved maps were replaced with reproducible Natural Earth geometry. Alaska/Hawaii are separately scaled insets. The country map shows eleven shapes, not every country.

Preserved unrelated work remains outside this candidate: Bunny Picnic, reading feeling choices, whole-school backup/import, sign-out, family sync notices, and sync shutdown changes. Current main's keyboard trail, Pippa routing, dance, parent navigation and family sync code are retained except the narrow globe integration and incomplete-session completion filter.

## Acceptance and release gate

- [ ] Independently review the exact candidate head and five-round behavior.
- [ ] Run globe UI cases: retries/hints/skips, cancellation/reopening, repeated activation, two-tab save race, reload, offline, portrait/narrow landscape, reduced motion and unavailable AI.
- [ ] Run keyboard/Pippa/teacher/dance/parent/sync browser regressions.
- [ ] Review rendered map labels/boundaries and phone targets.
- [ ] Owner accepts observation-only records and incomplete-session behavior.
- [ ] Merge/deployment owner passes the parent release gate.

Automated repository checks and focused persistence/geography tests are documented in the handoff evidence. Browser tests were attempted but the sandbox rejected binding the local preview server (`listen EPERM`); these are unrun, not passing. No production learner data or billable speech calls were used for validation.
