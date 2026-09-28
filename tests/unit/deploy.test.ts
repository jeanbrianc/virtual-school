/** The AWS stack: site password at the edge, and the pieces that keep /api private. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const template = readFileSync(new URL('../../infra/aws/stack.yaml', import.meta.url), 'utf8');

/** The CloudFront Function source, as CloudFormation would substitute it. */
function passwordFunction(hash: string): (event: unknown) => Record<string, unknown> {
  const lines = template.split('\n');
  const start = lines.findIndex((l) => /^\s+FunctionCode: !Sub \|\s*$/.test(l));
  assert.ok(start > 0, 'FunctionCode block found');
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith('        ')) break;
    body.push(line.slice(8));
  }
  const code = body.join('\n').replace('${BasicAuthHash}', hash);
  return new Function('require', `${code}\nreturn handler;`)(createRequire(import.meta.url)) as (event: unknown) => Record<string, unknown>;
}

/** What aws-deploy.sh stores for a username and password. */
const hashFor = (user: string, pass: string) =>
  createHash('sha256')
    .update(`Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`)
    .digest('hex');

describe('site password (CloudFront Function)', () => {
  const handler = passwordFunction(hashFor('family', 'correct horse battery'));
  const request = (authorization?: string) => ({
    request: { uri: '/index.html', headers: authorization ? { authorization: { value: authorization } } : {} },
  });

  it('lets the family in and strips the header before it reaches S3 or the AI helper', () => {
    const auth = `Basic ${Buffer.from('family:correct horse battery').toString('base64')}`;
    const out = handler(request(auth)) as { uri?: string; headers: Record<string, unknown> };
    assert.equal(out.uri, '/index.html');
    assert.equal(out.headers.authorization, undefined);
  });

  it('asks everyone else for the password', () => {
    for (const auth of [undefined, `Basic ${Buffer.from('family:wrong').toString('base64')}`, 'Bearer x']) {
      const out = handler(request(auth)) as { statusCode?: number; headers: Record<string, { value: string }> };
      assert.equal(out.statusCode, 401);
      assert.match(out.headers['www-authenticate']!.value, /^Basic realm=/);
    }
  });

  it('handles non-ASCII passwords the way browsers send them (UTF-8)', () => {
    const h = passwordFunction(hashFor('family', 'bücher-🦉'));
    const out = h(request(`Basic ${Buffer.from('family:bücher-🦉', 'utf8').toString('base64')}`)) as { statusCode?: number };
    assert.equal(out.statusCode, undefined);
  });
});

describe('stack wiring', () => {
  it('protects both the site and /api with the password', () => {
    assert.equal(template.match(/FunctionARN: !GetAtt PasswordFunction\.FunctionMetadata\.FunctionARN/g)?.length, 2);
  });

  it('keeps the bucket private and the AI helper behind CloudFront', () => {
    assert.match(template, /RestrictPublicBuckets: true/);
    assert.match(template, /OriginAccessControlOriginType: s3/);
    assert.match(template, /HeaderName: X-Origin-Verify\s+HeaderValue: !Ref OriginSecret/);
    assert.match(template, /ORIGIN_SECRET: !Ref OriginSecret/);
    assert.match(template, /PathPattern: \/api\/\*[\s\S]*?Managed-CachingDisabled/);
  });

  it('never ships secrets as defaults and pins the region', () => {
    for (const name of ['BasicAuthHash', 'AnthropicApiKey', 'OriginSecret']) {
      assert.match(template, new RegExp(`  ${name}:\\n    Type: String\\n    NoEcho: true`));
    }
    assert.match(template, /Assert: !Equals \[!Ref 'AWS::Region', us-east-1\]/);
    assert.match(template, /microphone=\(self\)/, 'talk-to-text still allowed');
  });

  it('only lets main of the configured repo deploy', () => {
    assert.match(template, /token\.actions\.githubusercontent\.com:sub: !Sub 'repo:\$\{GitHubRepo\}:ref:refs\/heads\/\$\{GitHubBranch\}'/);
  });
});
