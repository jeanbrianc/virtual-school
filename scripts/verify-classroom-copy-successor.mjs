// One reviewed successor only. This never treats the baseline talk failures as passes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const baseline = { head: '3d73450241804cd022587e98ca28e0ceb92aef84', tree: 'fcedd1b63c3900205fd9d4a4bfe6c6049e43cc40', run: 39068423166 };
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const save = (name, data) => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/${name}.json`, JSON.stringify(data, null, 2));
};
const focus = ['conversation-privacy-parent', 'talk', 'delete-learning-records', 'circuit', 'sync'];
const allowed = [
  'src/domain/types.ts',
  'src/ui/parent/pages/AvatarPage.tsx',
  'tests/unit/conversation-privacy.test.ts',
  'tests/e2e/conversation-privacy-parent.spec.ts',
  'tests/e2e/talk.spec.ts',
  '.github/workflows/all-classroom-release-browser.yml',
  '.github/workflows/seating-browser.yml',
  'scripts/verify-classroom-copy-successor.mjs',
];

if (process.argv[2] === 'source') {
  const changed = git('diff', '--name-only', baseline.tree, 'HEAD').split('\n').filter(Boolean);
  assert(
    changed.every((file) => allowed.includes(file)),
    `Unreviewed successor paths: ${changed}`,
  );
  const runtime = {
    'src/domain/types.ts': ['6d49e1e1756ce0dfd092b88b54e5cd546fa0157a', '3f40e05769be6f2d9a886ab6da26e1a396e6eb61'],
    'src/ui/parent/pages/AvatarPage.tsx': ['9292f9439e9e25afb412bd9f1a6f3b3942570a79', '13e065706db4f32436fcc143c028110c7086e6f0'],
  };
  assert.deepEqual(changed.filter((file) => file.startsWith('src/')).sort(), Object.keys(runtime).sort());
  for (const [file, [before, after]] of Object.entries(runtime)) {
    assert.equal(git('rev-parse', `${baseline.tree}:${file}`), before, file);
    assert.equal(git('rev-parse', `HEAD:${file}`), after, `Only the exact reviewed notice/comment bytes are allowed: ${file}`);
  }
  const protectedPaths = [
    'src/engine',
    'src/ui/child',
    'src/sync',
    'src/data',
    'src/services',
    'src/audio',
    'src/voice',
    'src/domain/lessons',
    'src/domain/music',
    'scripts/ai-helper',
    'infra',
    'tests/e2e/seating.spec.ts',
    'tests/e2e/combined-classroom-release.spec.ts',
  ];
  const sourceProof = protectedPaths.map((path) => {
    const before = git('rev-parse', `${baseline.tree}:${path}`),
      after = git('rev-parse', `HEAD:${path}`);
    assert.equal(after, before, path);
    return { path, before, after };
  });
  // Rebuild the exact baseline with the same locked dependencies and build tools.
  const oldRoot = mkdtempSync(join(dirname(process.cwd()), '.classroom-baseline-'));
  execFileSync('tar', ['-x', '-C', oldRoot], { input: execFileSync('git', ['archive', baseline.tree], { maxBuffer: 32 * 1024 * 1024 }) });
  // Keep dependency source-map paths equal: preserve a shared sibling symlink locally,
  // or hard-link the normal CI install into the sibling checkout without reinstalling.
  if (lstatSync('node_modules').isSymbolicLink()) symlinkSync(realpathSync('node_modules'), join(oldRoot, 'node_modules'), 'dir');
  else execFileSync('cp', ['-al', realpathSync('node_modules'), join(oldRoot, 'node_modules')]);
  const bundles = [];
  for (const dir of ['dist', 'dist-e2e']) {
    execFileSync(process.execPath, ['scripts/build.mjs', ...(dir === 'dist-e2e' ? ['--e2e'] : [])], { cwd: oldRoot, stdio: 'inherit' });
    const roots = [oldRoot, process.cwd()];
    const key = (meta) =>
      JSON.stringify({
        entry: meta.entryPoint ?? '',
        inputs: Object.keys(meta.inputs)
          .map((p) => p.replace(/^.*?node_modules\//, 'node_modules/'))
          .sort(),
      });
    const maps = roots.map(
      (root) =>
        new Map(
          Object.entries(read(join(root, dir, 'meta.json')).outputs)
            .filter(([file]) => /\.(js|css)$/.test(file))
            .map(([file, meta]) => [key(meta), { file, meta }]),
        ),
    );
    assert.deepEqual([...maps[0].keys()].sort(), [...maps[1].keys()].sort(), 'Emitted module inventory changed');
    const names = maps.map((map) => [...map].map(([id, { file }]) => [basename(file), `module-${hash(id)}`]));
    const normalize = (text, index) =>
      names[index].reduce(
        (s, [file, id]) => s.replaceAll(`"./${file}"`, `"./${id}"`).replaceAll(`sourceMappingURL=${file}.map`, `sourceMappingURL=${id}.map`),
        text,
      );
    for (const [id, old] of maps[0]) {
      const next = maps[1].get(id),
        bytes = roots.map((root, i) => readFileSync(join(root, i ? next.file : old.file)));
      const same = bytes[0].equals(bytes[1]);
      const sameCodeExceptAssetReferences = normalize(bytes[0].toString(), 0) === normalize(bytes[1].toString(), 1);
      const isNotice = old.meta.entryPoint === 'src/ui/parent/pages/AvatarPage.tsx';
      assert(same || sameCodeExceptAssetReferences || isNotice, `Unrelated emitted code changed: ${old.file}`);
      if (Object.keys(old.meta.inputs).some((p) => /src\/(engine|ui\/child|sync|data|services|audio|voice)\//.test(p)))
        assert(same, `Protected executable module must remain byte-identical: ${old.file}`);
      bundles.push({
        build: dir,
        entry: old.meta.entryPoint ?? null,
        beforeFile: old.file,
        afterFile: next.file,
        beforeSha256: hash(bytes[0]),
        afterSha256: hash(bytes[1]),
        byteIdentical: same,
        sameCodeExceptAssetReferences,
        reviewedNoticeModule: isNotice,
      });
    }
  }
  const proof = {
    baseline,
    successor: { head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') },
    changed,
    sourceProof,
    bundles,
    focusedSuites: focus,
    projects: ['desktop', 'phone'],
    totalJobs: focus.length * 2,
  };
  save('successor-boundaries', proof);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `suites=${JSON.stringify(focus)}\n`);
  console.log(
    JSON.stringify({
      baseline,
      successor: proof.successor,
      focusedSuites: focus,
      byteIdenticalModules: bundles.filter((b) => b.byteIdentical).length,
      modules: bundles.length,
    }),
  );
} else if (process.argv[2] === 'baseline') {
  const api = async (path) => {
    const response = await fetch(`https://api.github.com/repos/jeanbrianc/virtual-school/${path}`, {
      headers: { Accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
    });
    assert(response.ok, `Baseline API failed: ${response.status}`);
    return response.json();
  };
  const commit = await api(`git/commits/${baseline.head}`);
  assert.equal(commit.tree.sha, baseline.tree);
  let run;
  const deadline = Date.now() + 50 * 60_000;
  do {
    run = await api(`actions/runs/${baseline.run}`);
    assert.equal(run.head_sha, baseline.head);
    assert.equal(run.path, '.github/workflows/all-classroom-release-browser.yml');
    if (run.status === 'completed') break;
    assert(Date.now() < deadline, 'Baseline remains incomplete; release must wait');
    console.log(`Waiting for exact baseline ${baseline.run}: ${run.status}`);
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (true);
  assert.equal(run.conclusion, 'failure', 'Only the two recorded talk failures are expected');
  const jobs = (await api(`actions/runs/${baseline.run}/jobs?per_page=100`)).jobs;
  const suites = git('ls-tree', '--name-only', `${baseline.tree}:tests/e2e`)
    .split('\n')
    .filter((n) => n.endsWith('.spec.ts'))
    .map((n) => n.slice(0, -8));
  assert.equal(suites.length, 33);
  assert.equal(jobs.length, 67);
  const expectedFailures = new Map([
    ['Combined / talk / desktop', 117501157665],
    ['Combined / talk / phone', 117501157723],
  ]);
  const passing = [];
  for (const suite of suites)
    for (const project of ['desktop', 'phone']) {
      const name = `Combined / ${suite} / ${project}`,
        matches = jobs.filter((j) => j.name === name);
      assert.equal(matches.length, 1, name);
      const job = matches[0];
      assert.equal(job.status, 'completed', name);
      if (expectedFailures.has(name)) {
        assert.equal(job.id, expectedFailures.get(name));
        assert.equal(job.conclusion, 'failure');
      } else {
        assert.equal(job.conclusion, 'success', name);
        for (const step of [
          'Reject missing execution, skipped tests, flaky results, or failures',
          'Keep only successful generic screenshots and JSON evidence',
        ])
          assert.equal(job.steps.find((s) => s.name === step)?.conclusion, 'success', `${name}: ${step}`);
        passing.push(name);
      }
    }
  assert.equal(jobs.find((j) => j.name === 'checks-and-matrix')?.conclusion, 'success');
  assert.equal(passing.length, 64);
  const artifacts = (await api(`actions/runs/${baseline.run}/artifacts?per_page=100`)).artifacts;
  assert.equal(artifacts.length, 64);
  for (const suite of suites.filter((s) => s !== 'talk'))
    for (const project of ['desktop', 'phone'])
      assert.equal(
        artifacts.filter((a) => a.name === `all-classroom-${suite}-${project}-${baseline.head}` && !a.expired && a.digest?.startsWith('sha256:')).length,
        1,
      );
  save('baseline-reuse', {
    baseline,
    successor: { head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') },
    runConclusion: run.conclusion,
    passingPairs: passing,
    knownFailedTalkJobs: [...expectedFailures].map(([name, id]) => ({ name, id })),
    requiredSuccessorTalk: true,
    jobs,
    artifacts,
  });
  console.log('64 baseline pairs verified; two talk failures remain failures and require corrected successor execution.');
} else throw new Error('Expected source or baseline verification mode');
