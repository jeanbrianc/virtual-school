/** The AWS stack: site password at the edge, and the pieces that keep /api private. */
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const template = readFileSync(new URL('../../infra/aws/stack.yaml', import.meta.url), 'utf8');

/** The CloudFront Function source, as CloudFormation would substitute it. */
type EdgeResult = {
  uri?: string;
  statusCode?: number;
  headers: Record<string, { value: string } | undefined>;
  cookies?: Record<string, { value: string; attributes?: string }>;
};
function signInFunction(hash: string, secret: string): (event: unknown) => EdgeResult {
  const lines = template.split('\n');
  const start = lines.findIndex((l) => /^\s+FunctionCode: !Sub \|\s*$/.test(l));
  assert.ok(start > 0, 'FunctionCode block found');
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith('        ')) break;
    body.push(line.slice(8));
  }
  const code = body.join('\n').replace('${BasicAuthHash}', hash).replace('${SessionSecret}', secret);
  assert.doesNotMatch(code, /\$\{/, 'every template variable substituted');
  return new Function('require', `${code}\nreturn handler;`)(createRequire(import.meta.url)) as (event: unknown) => EdgeResult;
}

/** What aws-deploy.sh stores for a username and password. */
const hashFor = (user: string, pass: string) =>
  createHash('sha256')
    .update(`Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`)
    .digest('hex');
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
const SECRET = 'k'.repeat(64);

describe('family sign-in (CloudFront Function)', () => {
  const edge = signInFunction(hashFor('family', 'correct horse battery'), SECRET);
  const request = (uri: string, opts: { authorization?: string; cookie?: string } = {}) => ({
    request: {
      uri,
      method: 'GET',
      headers: opts.authorization ? { authorization: { value: opts.authorization } } : {},
      cookies: opts.cookie ? { school_session: { value: opts.cookie } } : {},
    },
  });
  const signIn = () => {
    const out = edge(request('/auth/session', { authorization: basic('family', 'correct horse battery') }));
    return out.cookies!.school_session!.value;
  };

  it('shows the branded welcome page at "/" before sign-in, and lets its files load', () => {
    assert.equal(edge(request('/')).uri, '/welcome/index.html');
    assert.equal(edge(request('/index.html')).uri, '/welcome/index.html');
    assert.equal(edge(request('/welcome/signin.js')).uri, '/welcome/signin.js');
    assert.equal(edge(request('/welcome/img/hoot.webp')).uri, '/welcome/img/hoot.webp');
  });

  it('keeps the school and the AI helper closed — without a browser password prompt', () => {
    const asset = edge(request('/assets/app-123.js'));
    assert.equal(asset.statusCode, 302);
    assert.equal(asset.headers.location!.value, '/');
    const api = edge(request('/api/v1/teacher'));
    assert.equal(api.statusCode, 401);
    for (const out of [asset, api]) assert.equal(out.headers['www-authenticate'], undefined);
  });

  it('gives the right password a signed, HttpOnly session cookie, and refuses others', () => {
    const ok = edge(request('/auth/session', { authorization: basic('family', 'correct horse battery') }));
    assert.equal(ok.statusCode, 204);
    const cookie = ok.cookies!.school_session!;
    assert.match(cookie.value, /^\d+\.[a-f0-9]{64}$/);
    assert.match(cookie.attributes!, /HttpOnly/);
    assert.match(cookie.attributes!, /Secure/);
    assert.match(cookie.attributes!, /SameSite=Lax/);
    for (const auth of [undefined, basic('family', 'wrong'), basic('someone', 'correct horse battery'), 'Bearer x']) {
      const out = edge(request('/auth/session', auth ? { authorization: auth } : {}));
      assert.equal(out.statusCode, 401);
      assert.equal(out.cookies, undefined);
      assert.equal(out.headers['www-authenticate'], undefined, 'no native browser prompt');
    }
  });

  it('opens the school with the cookie, and strips credentials before S3 or the AI helper', () => {
    const cookie = signIn();
    const home = edge(request('/', { cookie, authorization: 'Basic leftover' }));
    assert.equal(home.uri, '/');
    assert.equal(home.headers.authorization, undefined);
    assert.equal(edge(request('/assets/app-123.js', { cookie })).uri, '/assets/app-123.js');
    assert.equal(edge(request('/api/v1/teacher', { cookie })).uri, '/api/v1/teacher');
  });

  it('rejects tampered, expired or foreign cookies', () => {
    const [expires, sig] = signIn().split('.');
    const past = String(Math.floor(Date.now() / 1000) - 60);
    const signedPast = createHmac('sha256', SECRET).update(`v1.${past}`).digest('hex');
    const otherKey = createHmac('sha256', 'x'.repeat(64)).update(`v1.${expires}`).digest('hex');
    for (const cookie of [`${Number(expires) + 999999}.${sig}`, `${past}.${signedPast}`, `${expires}.${otherKey}`, 'garbage', `${expires}`]) {
      assert.equal(edge(request('/assets/app-123.js', { cookie })).statusCode, 302, cookie);
      assert.equal(edge(request('/', { cookie })).uri, '/welcome/index.html');
    }
  });

  it('signs out by clearing the cookie', () => {
    const out = edge(request('/auth/logout', { cookie: signIn() }));
    assert.equal(out.statusCode, 302);
    assert.equal(out.headers.location!.value, '/');
    assert.match(out.cookies!.school_session!.attributes!, /Max-Age=0/);
  });

  it('handles non-ASCII passwords the way the sign-in page sends them (UTF-8)', () => {
    const h = signInFunction(hashFor('family', 'bücher-🦉'), SECRET);
    assert.equal(h(request('/auth/session', { authorization: basic('family', 'bücher-🦉') })).statusCode, 204);
  });
});

describe('stack wiring', () => {
  it('protects both the site and /api with the family sign-in', () => {
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
    for (const name of ['BasicAuthHash', 'SessionSecret', 'AnthropicApiKey', 'OriginSecret']) {
      assert.match(template, new RegExp(`  ${name}:\\n    Type: String\\n    NoEcho: true`));
    }
    assert.match(template, /Assert: !Equals \[!Ref 'AWS::Region', us-east-1\]/);
    assert.match(template, /microphone=\(self\)/, 'talk-to-text still allowed');
  });

  it('only lets main of the configured repo deploy', () => {
    assert.match(template, /token\.actions\.githubusercontent\.com:sub: !Sub 'repo:\$\{GitHubRepo\}:ref:refs\/heads\/\$\{GitHubBranch\}'/);
  });
});
