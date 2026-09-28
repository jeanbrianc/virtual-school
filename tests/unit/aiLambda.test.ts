/** The AI helper as a Lambda behind CloudFront: origin secret, /api paths, base64 bodies. */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

type Handler = (typeof import('../../scripts/ai-helper/lambda'))['handler'];
let handler: Handler;
const calls: { url: string; init: RequestInit }[] = [];

before(async () => {
  process.env.ORIGIN_SECRET = 'test-secret-123';
  process.env.SITE_ORIGIN = 'https://lms.example.com';
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'teacher_reply', input: { reply: 'Hoo-hoo!', intent: 'share' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  ({ handler } = await import('../../scripts/ai-helper/lambda'));
});

const teacherBody = JSON.stringify({ teacherId: 'hoot', childName: 'Izzy', utterance: 'hello', history: [], bookTitles: [] });
const event = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) => ({
  rawPath: '/api/v1/teacher',
  requestContext: { http: { method: 'POST' } },
  headers: { 'x-origin-verify': 'test-secret-123', origin: 'https://lms.example.com', 'x-izzy-classroom': '1', ...headers },
  body: teacherBody,
  ...over,
});

describe('AI helper Lambda', () => {
  it('refuses anything that did not come through CloudFront', async () => {
    assert.equal((await handler(event({}, { 'x-origin-verify': 'wrong' }))).statusCode, 403);
    assert.equal((await handler({ ...event(), headers: { origin: 'https://lms.example.com', 'x-izzy-classroom': '1' } })).statusCode, 403);
    assert.equal(calls.length, 0);
  });

  it('answers /api/health and /api/v1/teacher for the site', async () => {
    const health = await handler({
      rawPath: '/api/health',
      requestContext: { http: { method: 'GET' } },
      headers: { 'X-Origin-Verify': 'test-secret-123', 'x-izzy-classroom': '1' },
    });
    assert.equal(health.statusCode, 200);
    assert.equal(JSON.parse(health.body).keyConfigured, true);
    const reply = await handler(event());
    assert.equal(reply.statusCode, 200);
    assert.deepEqual(JSON.parse(reply.body), { reply: 'Hoo-hoo!', intent: 'share' });
    assert.equal(calls.at(-1)!.url, 'https://api.anthropic.com/v1/messages');
  });

  it('decodes base64 bodies and still refuses other sites', async () => {
    assert.equal((await handler(event({ body: Buffer.from(teacherBody).toString('base64'), isBase64Encoded: true }))).statusCode, 200);
    assert.equal((await handler(event({}, { origin: 'https://evil.example' }))).statusCode, 403);
  });
});
