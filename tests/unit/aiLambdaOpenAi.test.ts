/** The AI helper Lambda with its OpenAI key in AWS Secrets Manager: key read on first use, audio returned base64. */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

type Handler = (typeof import('../../scripts/ai-helper/lambda'))['handler'];
let handler: Handler;
const calls: string[] = [];
const ARN = 'arn:aws:secretsmanager:us-east-2:111122223333:secret:openai/api-key-AbC123';

before(async () => {
  Object.assign(process.env, {
    ORIGIN_SECRET: 'test-secret-123',
    SITE_ORIGIN: 'https://lms.example.com',
    OPENAI_SECRET_ARN: ARN,
    OPENAI_MODEL: 'gpt-6-luna',
    AI_MODEL: 'claude-haiku-4-5-20251001',
    ANTHROPIC_API_KEY: '',
    AWS_ACCESS_KEY_ID: 'ASIAEXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'secret',
    AWS_SESSION_TOKEN: 'token',
  });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u === 'https://secretsmanager.us-east-2.amazonaws.com/') {
      assert.equal((init!.headers as Record<string, string>)['x-amz-target'], 'secretsmanager.GetSecretValue');
      return Response.json({ ARN, Name: 'openai/api-key', SecretString: 'sk-from-secrets-manager' });
    }
    assert.equal((init!.headers as Record<string, string>).authorization, 'Bearer sk-from-secrets-manager');
    if (u.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3, 4, 5]).buffer, { headers: { 'content-type': 'audio/mpeg' } });
    if (u.endsWith('/responses'))
      return Response.json({ output: [{ type: 'function_call', name: 'teacher_reply', arguments: '{"reply":"Hoo-hoo!","intent":"share"}' }] });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  ({ handler } = await import('../../scripts/ai-helper/lambda'));
});

const event = (path: string, body?: string, method = 'POST') => ({
  rawPath: path,
  requestContext: { http: { method } },
  headers: { 'x-origin-verify': 'test-secret-123', origin: 'https://lms.example.com', 'x-izzy-classroom': '1' },
  ...(body ? { body } : {}),
});

describe('AI helper Lambda with OpenAI', () => {
  it('reads the key from Secrets Manager once, then uses OpenAI', async () => {
    const health = await handler(event('/api/health', undefined, 'GET'));
    assert.deepEqual((({ provider, model, voices, listening }) => ({ provider, model, voices, listening }))(JSON.parse(health.body)), {
      provider: 'openai',
      model: 'gpt-6-luna',
      voices: true,
      listening: true,
    });
    const reply = await handler(
      event('/api/v1/teacher', JSON.stringify({ teacherId: 'hoot', childName: 'Izzy', utterance: 'hi', history: [], bookTitles: [] })),
    );
    assert.equal(reply.statusCode, 200);
    assert.deepEqual(JSON.parse(reply.body), { reply: 'Hoo-hoo!', intent: 'share' });
    assert.equal(calls.filter((c) => c.includes('secretsmanager')).length, 1, 'the key is cached');
  });

  it('returns teacher voices as base64 audio', async () => {
    const res = await handler(event('/api/v1/speak', JSON.stringify({ teacherId: 'hoot', text: 'Hoo-hoo!' })));
    assert.equal(res.statusCode, 200);
    assert.equal(res.isBase64Encoded, true);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.deepEqual([...Buffer.from(res.body, 'base64')], [1, 2, 3, 4, 5]);
  });

  it('still refuses anything that did not come through CloudFront', async () => {
    const res = await handler({ ...event('/api/v1/speak', '{}'), headers: { origin: 'https://lms.example.com', 'x-izzy-classroom': '1' } });
    assert.equal(res.statusCode, 403);
  });
});
