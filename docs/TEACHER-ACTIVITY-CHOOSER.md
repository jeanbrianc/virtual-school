# Shared teacher activity chooser (issue 20, first increment)

The typed registry retains every existing default `activity` and historical ID. Optional pre-lesson selection uses reviewed `activities`, `teacherActivities(teacherId)` and `teacherActivity(teacherId, activityId)`. Unknown teachers, cross-teacher IDs and prototype keys do not launch routes. There is no user-supplied URL or HTML.

`TeacherActivityChooser` takes `teacher`, `speech`, `onPick(activityId)` and `onClose`. It uses native touch/keyboard buttons, initial focus, Tab wrapping and Escape. `LessonFlow.onChooseActivity` exists only before a run starts. Dismissal returns to the original intro; opening a chooser cannot discard an active lesson. Stale async launches after dismissal are ignored. Hoot's default reading flow remains untouched; its expansion can reuse the registered reading/keyboard choices.

## Verification and acceptance

- `npm run check`: passed, including all 241 unit tests, type checking, architecture/privacy lint and production build.
- Added focused chooser desktop/375px tests and ran them plus the existing teacher-registry regression. These are **blocked before browser execution**: installed Chromium aborts with `socket() failed: Operation not permitted`. Bundled Playwright browser is absent. No browser pass is claimed.
- No merge or deployment. Synthetic test data only.

Owner/reviewer acceptance: run `activity-chooser.spec.ts` and `teacher-registry.spec.ts` in a browser-capable environment; check touch, keyboard focus, Escape/Close/reopen, offline and original default routes. New chooser routes do not modify saved learning evidence or unlocks.

Issue 20 remains open. Place value 20–99, base-ten representations, parent-controlled entry/review, reviewed objective evidence, progression/ceiling documentation and the later two-digit arithmetic increment are not implemented in this first slice. Arithmetic must wait for the place-value slice to be verified.

The candidate now includes main `5e2aaf9` and an independent, read-only `Teacher activity chooser review` pull-request workflow. It installs Chromium on CI and runs the focused desktop/phone-viewport tests plus the original teacher-route regression. CI results must be checked for the exact published head; adding the workflow is not a browser pass.
