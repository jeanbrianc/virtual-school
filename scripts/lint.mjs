#!/usr/bin/env node
/**
 * Project lint: architecture boundaries + privacy/safety guardrails + formatting.
 *
 * ESLint isn't available offline in this environment, so this script enforces
 * the rules that matter most for this codebase directly:
 *
 *  1. Layering — domain is pure; data/services never touch UI or 3D; the
 *     engine never touches React, services or storage.
 *  2. Privacy — no child-facing external links, no trackers/analytics, no
 *     network calls outside the explicit, consent-gated AI interpreter.
 *  3. Safety/quality — no eval, no innerHTML, no `any`, no stray console.log,
 *     no localStorage for records.
 *  4. Formatting — prettier --check.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(root, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((abs) => ({ abs, rel: relative(root, abs).split(sep).join('/'), text: readFileSync(abs, 'utf8') }));
const problems = [];
const report = (file, line, rule, msg) => problems.push(`${file}:${line}  ${rule}  ${msg}`);

/** Import specifiers with line numbers (static + dynamic). */
function importsOf(text) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1] ?? m[2];
    const line = text.slice(0, m.index).split('\n').length + (m[0].startsWith('\n') ? 1 : 0);
    out.push({ spec, line });
  }
  return out;
}

function resolveLayer(fromRel, spec) {
  if (!spec.startsWith('.')) return `pkg:${spec.split('/')[0]}`;
  const parts = fromRel.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const p = parts.join('/');
  const layer = p.replace(/^src\//, '').split('/')[0];
  return `src:${layer}`;
}

// ── 1. Layering ───────────────────────────────────────────────────────────
const LAYER_RULES = [
  {
    layer: 'domain',
    forbid: ['src:ui', 'src:engine', 'src:app', 'src:services', 'src:data', 'src:state', 'src:audio', 'src:voice', 'pkg:react', 'pkg:react-dom', 'pkg:three'],
  },
  { layer: 'data', forbid: ['src:ui', 'src:engine', 'src:app', 'src:services', 'src:state', 'pkg:react', 'pkg:three'] },
  { layer: 'services', forbid: ['src:ui', 'src:engine', 'src:app', 'src:state', 'pkg:react', 'pkg:three'] },
  { layer: 'engine', forbid: ['src:ui', 'src:app', 'src:services', 'src:data', 'src:state', 'pkg:react', 'pkg:react-dom'] },
  { layer: 'shared', forbid: ['src:ui', 'src:engine', 'src:services', 'src:data', 'pkg:react', 'pkg:three'] },
];
for (const f of files) {
  const layer = f.rel.replace(/^src\//, '').split('/')[0];
  const rule = LAYER_RULES.find((r) => r.layer === layer);
  if (!rule) continue;
  for (const { spec, line } of importsOf(f.text)) {
    const target = resolveLayer(f.rel, spec);
    if (rule.forbid.includes(target)) report(f.rel, line, 'layering', `${layer} must not import ${target.replace(/^\w+:/, '')} ('${spec}')`);
  }
}

// ── 2 & 3. Pattern rules ───────────────────────────────────────────────────
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const CHILD_FACING = /^src\/(ui\/child|ui\/home|ui\/showcase|engine)\//;
const PATTERN_RULES = [
  {
    id: 'no-external-links',
    applies: (f) => CHILD_FACING.test(f.rel),
    re: /https?:\/\/(?!www\.w3\.org\/)/g,
    msg: 'child-facing code must not contain external URLs',
  },
  {
    id: 'no-trackers',
    applies: () => true,
    re: /google-analytics|googletagmanager|gtag\(|mixpanel|segment\.(io|com)|amplitude|hotjar|facebook\.net|fbq\(|posthog|sentry/gi,
    msg: 'no analytics/ad/tracking code',
  },
  {
    id: 'network-only-in-ai-adapter',
    applies: (f) => !/(?:interpretation\/remoteInterpreter|teachers\/chatRemote)\.ts$/.test(f.rel),
    re: /\bfetch\s*\(|XMLHttpRequest|new WebSocket|navigator\.sendBeacon/g,
    msg: 'network calls are only allowed in the consent-gated AI adapters',
  },
  { id: 'no-eval', applies: () => true, re: /\beval\s*\(|new Function\s*\(/g, msg: 'no eval / new Function' },
  { id: 'no-inner-html', applies: () => true, re: /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=/g, msg: 'no raw HTML injection' },
  { id: 'no-any', applies: () => true, re: /(?<!\?):\s*any\b|\bas any\b|<any>/g, msg: 'avoid `any` (strict typing)' },
  { id: 'no-console-log', applies: () => true, re: /console\.log\s*\(/g, msg: 'use console.warn/error for real problems; no stray console.log' },
  { id: 'no-local-storage', applies: () => true, re: /\blocalStorage\b|document\.cookie/g, msg: 'records live in IndexedDB; no localStorage/cookies' },
  {
    id: 'no-face-recognition',
    applies: () => true,
    re: /FaceDetector|face-api|faceLandmark|detectFaces/g,
    msg: 'face recognition/biometrics are out of scope by design',
  },
];
for (const f of files) {
  const code = stripComments(f.text);
  for (const rule of PATTERN_RULES) {
    if (!rule.applies(f)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(code))) report(f.rel, lineOf(code, m.index), rule.id, `${rule.msg} (“${m[0]}”)`);
  }
}

// Child-facing copy must never show standards codes or grade labels.
for (const f of files.filter((x) => /^src\/ui\/(child|home)\//.test(x.rel))) {
  const code = stripComments(f.text);
  const re = /['"`][^'"`\n]*\b(CCSS|NGSS|RL\.\d|RF\.\d|K\.CC|Grade \d|Kindergarten)\b[^'"`\n]*['"`]/g;
  let m;
  while ((m = re.exec(code))) report(f.rel, lineOf(code, m.index), 'no-grade-labels-for-child', `child UI must not show standards or grade labels (${m[1]})`);
}

// ── 4. Formatting ─────────────────────────────────────────────────────────
const prettier = spawnSync(
  process.execPath,
  [join(root, 'node_modules/prettier/bin/prettier.cjs'), '--check', 'src/**/*.{ts,tsx,css}', 'tests/**/*.ts', 'scripts/**/*.mjs', 'playwright.config.ts'],
  {
    cwd: root,
    encoding: 'utf8',
  },
);
if (prettier.status !== 0) {
  const lines = `${prettier.stdout}\n${prettier.stderr}`.split('\n').filter((l) => l.startsWith('[warn]') && !l.includes('Code style issues'));
  for (const l of lines) problems.push(`${l.replace('[warn] ', '')}  prettier  not formatted (run npm run format)`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n✖ ${problems.length} lint problem${problems.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.info(`✔ lint passed (${files.length} source files: layering, privacy, safety, formatting)`);
