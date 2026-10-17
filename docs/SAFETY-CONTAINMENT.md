# Teacher conversation containment

This bounded correction relates to #9 and depends on the usage integration in
#36 at `15a2869a0671bc514f21eef50e93b298b35c729d`. It changes no deployment,
credentials, permissions, provider configuration or saved family settings.

## Boundary

The existing on-device recognizer already handles certain safety utterances
locally. Previously a later ordinary utterance could send that earlier text in
its last-eight-turn history. A conversation now owns a monotonic local-only
boundary separate from its retained transcript. The full available history is
checked before transport truncation; known sensitive echoes and book context
also prevent dispatch. Once contained, later turns stay on-device even if the
history is shortened, a teacher or adapter changes, or Back resets the topic.
Adapter callers can retain the explicit privacy object with their conversation;
legacy callers without one stay local for that adapter's remaining lifetime.
A fresh flow with genuinely fresh context may again use parent-enabled AI.
Reopening retained history checks that history before sending or speaking.
Contained turns carry a local-only marker, so retaining only a later portion of
the transcript still retains the boundary. A system note records containment
without deleting or rewriting the original words.

The original transcript is not filtered or deleted. Parent notes survive Back
and remain available when the flow is saved. This is containment of recognized
cases, not a claim to recognize every sensitive utterance. Text accidentally
sent before recognition cannot be recalled. A new adapter with externally
truncated history must also receive the retained privacy boundary: unseen,
discarded context cannot be reconstructed.

## Speech

Read-aloud, Replay and voice-triggered replies read the conversation's live
boundary. Containment cancels queued helper speech. The helper speech adapter
also checks recognized raw echoes before hashing or accessing its voice cache,
and checks cancellation again after asynchronous digest/cache waits, before
request dispatch. A contained line is never added to the helper voice cache.
Existing caches and records are not erased. Only a voice marked localService
may speak a contained line; if none exists, its text remains visible and no
speech request is made. Ordinary nonsensitive opted-in voice behavior remains.

This does not change speech recognition: parent-enabled helper/browser
transcription can transmit audio before the app knows the resulting words.
It also does not change parent-initiated exports, sync, or other existing
record-handling permissions. It does not implement a broader safety classifier,
provider content deletion, or the remaining privacy backlog.

## Synthetic verification

- Adapter and hook tests: current safety, later benign/repeated turns beyond the
  eight-turn outbound limit, retained-history reopen, reset, service/teacher
  replacement, original note retention, ordinary AI, validation fallback and
  actual-dispatch-only usage accounting.
- Speech tests: recognized raw echo, explicit contained paraphrase, no cache
  hashing for contained text, cancellation during digest and persistent-cache
  waits, local-voice selection and text-only fallback when only remote voices
  are available.
- Browser workflow: actual Chromium desktop and Pixel 7 viewport projects,
  synthetic fixture records only, all helper routes mocked and external hosts
  blocked. Verify ordinary AI/voice first, then zero new helper requests through
  safety, repeated turns, Replay and Back. Verify fresh unrelated teacher AI
  remains usable, and the original parent note/transcript remain visible.
- No live provider, real microphone, child data, paid service or production
  deployment is needed for this verification.

The browser job saves screenshots and captured mocked outbound request bodies
as test artifacts. Local browser execution is unavailable in the current
sandbox because socket binding is denied; hosted CI is the browser evidence.
