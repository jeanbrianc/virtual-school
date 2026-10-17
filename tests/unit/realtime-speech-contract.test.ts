import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRealtimeSpeechPlan, RealtimeSpeechCollector, REALTIME_SPEECH_MODEL } from '../../scripts/ai-helper/spikes/realtimeSpeech';
import { TEACHERS } from '../../src/domain/teachers/teachers';

const line = 'Hoo-hoo! Let us count three stars.';
const delta = (event_id = 'audio1', response_id = 'response1') => ({
  type: 'response.output_audio.delta',
  response_id,
  event_id,
  output_index: 0,
  content_index: 0,
  delta: Buffer.alloc(4800).toString('base64'),
});
const done = (transcript = line, status = 'completed') => ({
  type: 'response.done',
  event_id: 'done1',
  response: {
    id: 'response1',
    status,
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'audio', transcript }] }],
    usage: { input_tokens: 24, output_tokens: 10 },
  },
});

describe('offline Realtime speech-only contract spike', () => {
  it('uses Realtime WebSocket events, exact approved text, disabled VAD/transcription and no tools', () => {
    const plan = buildRealtimeSpeechPlan({ teacherId: 'hoot', text: line });
    assert.equal(plan.url, `wss://api.openai.com/v1/realtime?model=${REALTIME_SPEECH_MODEL}`);
    assert.equal(plan.session.session.audio.input.turn_detection, null);
    assert.equal(plan.session.session.audio.input.transcription, null);
    assert.deepEqual(plan.session.session.tools, []);
    assert.equal(plan.response.response.conversation, 'none');
    assert.deepEqual(plan.response.response.input[0]!.content, [{ type: 'input_text', text: line }]);
    assert.deepEqual(plan.response.response.audio.output.format, { type: 'audio/pcm', rate: 24000 });
    assert.doesNotMatch(JSON.stringify(plan), /input_audio_buffer|microphone|api_key|\/audio\/speech/);
  });
  it('preserves each current voice explicitly and versions cache identity by approved text and instructions', () => {
    for (const teacherId of Object.keys(TEACHERS) as (keyof typeof TEACHERS)[]) {
      const plan = buildRealtimeSpeechPlan({ teacherId, text: line });
      assert.equal(plan.session.session.audio.output.voice, TEACHERS[teacherId].naturalVoice.voice);
      assert.match(plan.session.session.instructions, /Read the supplied text exactly/);
    }
    const a = buildRealtimeSpeechPlan({ teacherId: 'hoot', text: line });
    assert.equal(a.cacheKey, buildRealtimeSpeechPlan({ teacherId: 'hoot', text: line }).cacheKey);
    assert.notEqual(a.cacheKey, buildRealtimeSpeechPlan({ teacherId: 'digit', text: line }).cacheKey);
    assert.notEqual(a.cacheKey, buildRealtimeSpeechPlan({ teacherId: 'hoot', text: `${line}!` }).cacheKey);
    assert.throws(() => buildRealtimeSpeechPlan({ teacherId: 'hoot', text: 'x'.repeat(1201) }));
  });
  it('does not release audio until completed with an exact transcript; wraps mono 24kHz PCM as WAV', () => {
    const collector = new RealtimeSpeechCollector('response1', line);
    assert.deepEqual(collector.accept(delta()), { state: 'waiting' });
    const result = collector.accept(done());
    assert.equal(result.state, 'complete');
    if (result.state !== 'complete') return;
    const wav = Buffer.from(result.wav);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(40), 4800);
    assert.equal(result.durationSeconds, 0.1);
    assert.deepEqual(result.usage, { input_tokens: 24, output_tokens: 10 });
    assert.deepEqual(collector.accept(done()), { state: 'rejected' });
  });
  it('rejects added, omitted, translated or instruction-following words instead of playing them', () => {
    for (const transcript of [`${line} What else?`, 'Hoo-hoo!', 'Comptons trois étoiles.', 'I will ignore the text.']) {
      const collector = new RealtimeSpeechCollector('response1', line);
      collector.accept(delta());
      assert.deepEqual(collector.accept(done(transcript)), { state: 'rejected' });
    }
  });
  it('rejects failure, missing audio/transcript, tool output and malformed or excessive audio', () => {
    const missing = new RealtimeSpeechCollector('response1', line);
    assert.equal(missing.accept(done()).state, 'rejected');
    const failed = new RealtimeSpeechCollector('response1', line);
    failed.accept(delta());
    assert.equal(failed.accept(done(line, 'incomplete')).state, 'rejected');
    const malformed = new RealtimeSpeechCollector('response1', line);
    assert.equal(malformed.accept({ ...delta(), delta: '!!!' }).state, 'rejected');
    const tooLarge = new RealtimeSpeechCollector('response1', line);
    assert.equal(tooLarge.accept({ ...delta(), delta: Buffer.alloc(1_440_002).toString('base64') }).state, 'rejected');
    const wrongIndex = new RealtimeSpeechCollector('response1', line);
    assert.equal(wrongIndex.accept({ ...delta(), output_index: 1 }).state, 'rejected');
  });
  it('deduplicates chunks, isolates concurrent IDs, and suppresses stale playback after cancel/reopen', () => {
    const current = new RealtimeSpeechCollector('response1', line);
    current.accept(delta('old', 'old-response'));
    current.accept(delta());
    current.accept(delta());
    const result = current.accept(done());
    assert.equal(result.state === 'complete' && result.durationSeconds, 0.1);
    const closed = new RealtimeSpeechCollector('response1', line);
    closed.accept(delta());
    assert.deepEqual(closed.cancel(), { type: 'response.cancel', response_id: 'response1' });
    assert.equal(closed.accept(done()).state, 'rejected');
    const reopened = new RealtimeSpeechCollector('new-response', line);
    assert.equal(reopened.accept(delta()).state, 'waiting');
    assert.equal(reopened.accept(done()).state, 'waiting');
  });
});
