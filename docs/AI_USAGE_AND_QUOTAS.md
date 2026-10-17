# AI usage visibility and durable quota design

Design checked 2026-10-17. Partial delivery for [#25](https://github.com/jeanbrianc/virtual-school/issues/25); keep the issue open. No infrastructure, permissions, credentials, billing settings or deployment are changed here.

## Observation layer in this PR

Parent Studio → Settings → AI usage and costs shows aggregate attempts, successful responses, failures, cancellations, pending requests, voice cache hits and actual built-in fallback invocations. The existing Parent PIN gates the UI; it is not authentication against an adult with device access. There is **no new usage endpoint**. No counts are sent to an analytics service or synced with family records.

The source is this tab's in-memory journal, within the current partial UTC day since page load or Clear. A page reload, UTC midnight or Clear discards it. Other tabs/devices, earlier loads, helper cold starts/workers, provider-side retries, and requests outside this app are absent. Zero observed requests never means zero account usage. Midnight completions from the previous window are discarded rather than misattributed to the next day; they are another explicitly missing part of the new window.

Only service, allowlisted provider/model labels and numeric counters are retained. Unknown/custom models become `unreported`; names, learner identifiers, book titles, prompts, transcripts, recordings, URLs and arbitrary provider metadata cannot become labels. The optional helper response header contains only allowlisted model/provider and reported input/output token counts. An older or custom helper can omit it without breaking the app. Missing units are unknown, never zero. Raw provider bodies do not leave the helper for metering.

Outcomes describe the browser's request/validation result, not the provider's charge. Cancelled/timed-out/failed calls may still incur cost. Teacher-reply and interpretation adapters currently count timeout aborts as failed; speech/listening adapters count their aborts (including timeouts) as cancelled. These are adapter-specific diagnostics, not a uniform cancellation or billing classification. Speech generation success does not prove successful audio playback. Parent voice tests count as speech attempts. Cache/fallback events are separate and may occur without a new request. Device-only speech/listening and local lessons are not metered. Existing consent gates are unchanged.

Estimated API cost, verified provider billing and hosting cost are separate **unknown/unavailable** fields. No runtime price conversion is installed. Complete units, effective model pricing and authorized billing reconciliation are prerequisites for a credible estimate. The reference Realtime pricing snapshot in [the speech plan](VOICE_MIGRATION.md) is for planning, not retrospective billing.

Parents can choose an advisory 10/50/100/300-request warning (or Off) visible in this card. Only the threshold preference is saved in existing household settings. It does not block requests, alert in child mode or send notifications. Export downloads this window's sanitized JSON locally. Clear deletes these observations, not provider records, invoices or throttle state.

Existing helper throttles are process-local per-minute/request-per-UTC-day limits. Each worker starts fresh; these do not enforce a household budget or monetary cap. Setting a request count is not a price estimate.

## Proposed durable enforcement (NOT enabled)

### Scope and pricing

Start with this single household and **only calls made by this helper**. Use one application-wide budget across teacher replies, interpretation, speech and listening, plus optional per-service sublimits. Hosting, existing calls, provider-console calls, other apps, taxes, currency changes and provider adjustments remain outside the guardrail. Unknown model/price/unit bounds disable paid dispatch, not metering.

Use integer USD microdollars, a versioned immutable pricing snapshot (`id`, checked/effective dates, expiry, currency, explicit token/audio categories and rounding rule), and conservative upper bounds for every request. Require request/input size bounds and maximum output tokens/duration. Prices are selected server-side, never from a browser. Reserve all applicable daily/monthly/service limits in the same transaction. A hard application monetary-cap claim is blocked until provider semantics prove the upper bound covers all billed categories; otherwise call it a conservative application guardrail and retain a safety margin. Expired/unknown pricing or an unreviewed model fails closed.

Use explicit UTC midnight/day and first-of-month boundaries server-side. A parent-local display timezone must not change ledger windows or reset a budget. Capture the window at reservation and settle against that original window even when completion crosses midnight/month end. Clock uncertainty and stale metering/configuration fail closed.

### Atomic reservation and finalization

1. Validate consent, service/model configuration, input bounds and canonical request ID before dispatch. A request ID is a random operation UUID, not a learner ID or a content-derived identifier. Persist its window, service/model/config revision, maximum reserved units/cost and state only; do not persist request content.
2. One serializable transaction conditionally creates the reservation and increments held budget in every relevant scope, only if spent + held + requested reserve ≤ each budget. All concurrent workers must use the same backing store. On conditional conflict, reread and retry the **ledger transaction only**, with a bounded retry/deadline. Do not call the provider until success is confirmed.
3. Conditional reserved→dispatched transition provides a single dispatch owner. A duplicate ID returns pending/completed/uncertain status and must not call the provider again. Reject reuse with a changed config/window/reservation. Do not assume provider HTTP idempotency without an official endpoint contract.
4. A successful validated provider receipt atomically subtracts the hold, adds actual rounded usage/cost, and marks the request settled exactly once. A duplicate finalization changes nothing. An actual cost above the reservation is recorded honestly and locks paid dispatch pending investigation; never clamp it away.
5. A proven failure **before dispatch** releases the hold, retaining a non-replayable request tombstone. Any timeout, lost response, worker crash after dispatch, cancellation or ambiguous provider error consumes the full reservation or keeps it held until authorized reconciliation. A timer alone never releases a possibly billable call. Expired leases block, rather than reassigning dispatch ownership and risking duplicate paid calls.
6. A crash between dispatch-state commit and network send may charge the internal guardrail conservatively even when no provider call happened. This availability/cost tradeoff is intentional: strict exactly-once external charging cannot be guaranteed without provider idempotency. Do not refund based only on client failure.
7. If finalization cannot be committed, keep its durable hold. All new paid calls must fail closed when reservation/consistent state cannot be established. Exhaustion, outage and stale pricing return a bounded category/cooldown to the parent, preserve built-in speech/local lessons, and never silently try a second paid model/provider. No automatic paid retries. An authorized reconciliation can settle conservative holds later.
8. Cache hits do not reserve provider spend. Model/voice/instructions/version changes invalidate audio caches; caches never substitute for durable request deduplication. Failed cache writes must not trigger another paid call.

`spikes/quotaContract.ts` is an executable semantic sketch used only by synthetic tests. Shared memory mimics one serializable transaction; it is **not a durable implementation**, does not survive a process restart, and does not establish DynamoDB correctness. Recreated test clients share the same synthetic backing state. Production acceptance still requires real transaction conflict, process-kill, outage, uncertain-write/retry, stale-price, multi-scope and reset-boundary integration tests.

### Exact proposed infrastructure/access decision

The repository already defines one on-demand `FamilyRecordsTable`, with `pk`/`sk`, a `byChange` index, PITR, and helper role `GetItem`, `PutItem`, `Query` on that table. Proposed reuse: a separate `quota-v1` partition, no `changedAt` field so no sync-index entry, and no route returning these items through family sync.

Conditional transactional **Put** operations can replace versioned budget/reservation items using CAS after strongly consistent reads; this approach is intended to reuse existing `GetItem`/`PutItem` permissions. [AWS transaction IAM documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html) states transactional operations use their underlying item-operation permissions. This is a design expectation, not verified deployed IAM. No new wildcard action, credential, table, queue or service is requested. If implementation instead needs UpdateItem/DeleteItem/ConditionCheckItem, present an exact table/action policy diff for owner approval first.

Proposed aggregate/reservation retention: 35 days with explicit expiry. Enabling table TTL requires owner approval and a reviewed CloudFormation change; omit TTL attributes on all learning records. Keep active holds and replay protection until the accounting/retry window is closed; never expire an active reservation merely to free budget. TTL deletion is asynchronous. Existing PITR/backups can retain deleted aggregates according to their recovery policy; disclose this rather than promising instant erasure. Parent exports/deletions need a server-authenticated parent route before adding a deployment-wide UI. The browser PIN or shared family sign-in is insufficient proof of parent authority. Do not add such a route as a shortcut.

A simple two-item reserve, single-item dispatch, two-item settlement is roughly nine write request units for ≤1 KB items before retries, plus reads; multiple scopes increase it. Hosting costs are separate and unverified. Proposed owner decision: approve **design/implementation review of reuse only**, a 35-day aggregate TTL change and an incremental AWS target budget of $1/month with an alert, not a guarantee. Production mutation, rollout and any additional access still require the exact reviewed changes and approval. No provider or billing account inspection is implied.

## Verification and remaining work

Synthetic tests cover metadata allowlisting and unknown usage, idempotent observation completion, clear/reset/midnight, independent journals, no analytics route, shared-reference parallel reservation, duplicate dispatch/finalization, new client objects, uncertainty/outage and original-window settlement. Browser tests exercise the actual PIN gate, desktop/phone-width layout, 10-request warning, nonpersonal voice tests, JSON export, Clear and reload. Test results are recorded in the PR; do not infer a live-provider or distributed-store pass from unit fixtures.

Still open: durable backend/parent authentication, exact priced usage across all services, provider reconciliation, real atomic/concurrent integration tests, paid fail-closed runtime integration, reviewed infra/access/retention changes and approved deployment. #25 stays open until these are delivered and verified.
