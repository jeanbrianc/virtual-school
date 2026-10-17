import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUsageJournal, readUsageReceipt, USAGE_HEADER } from '../../src/domain/usage';
import { usageHeaders } from '../../scripts/ai-helper/usage';
import { createHelper } from '../../scripts/ai-helper/handler';
import { testNaturalVoice } from '../../src/domain/teachers/chatRemote';
import { QuotaContract, newQuotaState } from '../../scripts/ai-helper/spikes/quotaContract';

describe('privacy-minimal observed usage', () => {
  it('keeps provider-reported units separate from unknown, and finalizes only once', () => {
    const journal = createUsageJournal(() => Date.UTC(2026, 9, 17));
    const finish = journal.begin('teacher');
    assert.equal(journal.snapshot().rows[0]!.pending, 1);
    const header = usageHeaders('openai', 'gpt-6-luna', { usage: { input_tokens: 10, output_tokens: 3 }, transcript: 'PRIVATE' })[USAGE_HEADER]!;
    finish('succeeded', header);
    finish('failed', header);
    journal.begin('speech')('failed');
    journal.event('speech', 'fallbacks');
    journal.event('speech', 'cacheHits');
    const rows = journal.snapshot().rows;
    assert.equal(
      rows.reduce((n, r) => n + r.attempted, 0),
      2,
    );
    assert.equal(rows.find((r) => r.model === 'gpt-6-luna')!.inputTokens, 10);
    assert.equal(rows.find((r) => r.service === 'speech')!.inputTokens, undefined);
    assert.equal(rows.find((r) => r.service === 'speech')!.unknownUsage, 1);
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/);
  });
  it('rejects arbitrary labels, bodies and malformed or unbounded token metadata', () => {
    const value = readUsageReceipt(
      JSON.stringify({ provider: 'Child Name', model: 'Private book title', inputTokens: -1, outputTokens: 1.5, text: 'PRIVATE' }),
    );
    assert.deepEqual(value, { provider: 'unreported', model: 'unreported' });
    assert.deepEqual(readUsageReceipt('null'), value);
    assert.deepEqual(readUsageReceipt('x'.repeat(513)), value);
    assert.doesNotMatch(JSON.stringify(usageHeaders('openai', 'PRIVATE', { usage: { input_tokens: Infinity, output_tokens: 2 } })), /PRIVATE|Infinity/);
  });
  it('clears pending completions and resets by UTC day, never browser timezone', () => {
    let time = Date.parse('2026-10-17T23:59:59Z');
    const journal = createUsageJournal(() => time);
    const finish = journal.begin('listening');
    time += 2000;
    finish('succeeded');
    assert.equal(journal.snapshot().rows.length, 0);
    const pending = journal.begin('speech');
    journal.clear();
    pending('failed');
    assert.equal(journal.snapshot().rows.length, 0);
    assert.equal(journal.snapshot().timezone, 'UTC');
  });
  it('separate tabs/restarts have separate empty observations, never fabricated totals', () => {
    const first = createUsageJournal();
    first.begin('teacher')('cancelled');
    assert.equal(first.snapshot().rows[0]!.unknownUsage, 1);
    assert.equal(createUsageJournal().snapshot().rows.length, 0);
  });
  it('the helper adds allowlisted response units but no analytics route or provider content', async () => {
    const helper = createHelper({
      openaiKey: 'synthetic-key',
      fetchImpl: async () =>
        Response.json({
          output: [{ type: 'function_call', name: 'record_learning', arguments: '{"title":"Synthetic"}' }],
          usage: { input_tokens: 12, output_tokens: 5 },
          private: 'DO NOT FORWARD',
        }),
    });
    const response = await helper({ method: 'POST', path: '/v1/interpret', headers: { 'x-izzy-classroom': '1' }, body: '{"narrative":"Synthetic fixture"}' });
    assert.equal(response.status, 200);
    assert.deepEqual(readUsageReceipt(response.headers[USAGE_HEADER]!), { provider: 'openai', model: 'gpt-6-luna', inputTokens: 12, outputTokens: 5 });
    assert.doesNotMatch(JSON.stringify(response.headers), /Synthetic|FORWARD|synthetic-key/);
    assert.equal((await helper({ method: 'GET', path: '/v1/usage', headers: { 'x-izzy-classroom': '1' } })).status, 404);
  });
  it('prevents a model-name-only Realtime migration and preserves the nonpersonal parent test', async () => {
    let calls = 0;
    const helper = createHelper({
      openaiKey: 'synthetic-key',
      voiceModel: 'gpt-realtime-2.1-mini',
      fetchImpl: async () => {
        calls += 1;
        return new Response('');
      },
    });
    const response = await helper({
      method: 'POST',
      path: '/v1/speak',
      headers: { 'x-izzy-classroom': '1' },
      body: '{"teacherId":"hoot","text":"Synthetic line"}',
    });
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
    await testNaturalVoice('/api', async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).text, 'Hoo-hoo! This is a teacher voice test.');
      return new Response(new Uint8Array(200), { headers: { 'content-type': 'audio/mpeg' } });
    });
  });
});

describe('durable quota design contract (in-memory transaction double only)', () => {
  const request = (id: string, window = '2026-10-17') => ({ id, window, maximumMicros: 100, pricingVersion: 'synthetic-v1' });
  it('parallel clients cannot over-reserve a shared atomic budget', async () => {
    const state = newQuotaState();
    const clients = [new QuotaContract(state), new QuotaContract(state)];
    const results = await Promise.all(Array.from({ length: 20 }, (_, n) => Promise.resolve().then(() => clients[n % 2]!.reserve(request(`r${n}`), 500))));
    assert.equal(results.filter((r) => r === 'reserved').length, 5);
    assert.equal(state.windows.get('2026-10-17')!.held, 500);
  });
  it('recreated clients, retries and duplicate finalization neither double-charge nor dispatch again', () => {
    const state = newQuotaState();
    const first = new QuotaContract(state);
    assert.equal(first.reserve(request('r'), 500), 'reserved');
    assert.equal(first.dispatch('r'), true);
    const restartedClient = new QuotaContract(state);
    assert.equal(restartedClient.reserve(request('r'), 500), 'duplicate');
    assert.equal(restartedClient.dispatch('r'), false);
    assert.equal(restartedClient.finalize('r', { actualMicros: 60 }), true);
    assert.equal(restartedClient.finalize('r', { actualMicros: 60 }), false);
    assert.deepEqual(state.windows.get('2026-10-17'), { held: 0, spent: 60 });
  });
  it('fails closed on outage, uncertain outcome, missing pricing or exhausted reservations', () => {
    const state = newQuotaState();
    const ledger = new QuotaContract(state);
    state.available = false;
    assert.equal(ledger.reserve(request('r'), 100), 'blocked');
    state.available = true;
    assert.equal(ledger.reserve({ ...request('r'), pricingVersion: '' }, 100), 'blocked');
    assert.equal(ledger.reserve(request('r'), 100), 'reserved');
    assert.equal(ledger.dispatch('r'), true);
    assert.equal(ledger.finalize('r', { neverDispatched: true }), false);
    assert.equal(ledger.finalize('r', { uncertain: true }), true);
    assert.equal(ledger.reserve(request('s'), 100), 'blocked');
  });
  it('midnight retains original-window holds and rejects reuse of an old ID', () => {
    const state = newQuotaState();
    const ledger = new QuotaContract(state);
    ledger.reserve(request('r'), 100);
    ledger.dispatch('r');
    assert.equal(ledger.reserve(request('r', '2026-10-18'), 100), 'blocked');
    assert.equal(ledger.reserve(request('s', '2026-10-18'), 100), 'reserved');
    ledger.finalize('r', { actualMicros: 40 });
    assert.deepEqual(state.windows.get('2026-10-17'), { held: 0, spent: 40 });
    assert.equal(state.windows.get('2026-10-18')!.held, 100);
  });
  it('only proven pre-dispatch failures release their reservation; cache hits need no reserve', () => {
    const state = newQuotaState();
    const ledger = new QuotaContract(state);
    ledger.reserve(request('r'), 100);
    assert.equal(ledger.finalize('r', { neverDispatched: true }), true);
    assert.equal(ledger.reserve(request('r'), 100), 'duplicate');
    assert.equal(ledger.reserve(request('s'), 100), 'reserved');
  });
});
