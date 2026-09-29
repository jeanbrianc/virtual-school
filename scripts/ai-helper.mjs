// Starts the optional local AI helper alongside `npm run dev` / `npm run preview`
// when OPENAI_API_KEY or ANTHROPIC_API_KEY is set in .env.local (or the environment).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './esbuild.shared.mjs';

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** Spawns the helper if a key is configured; returns a stop function. */
export function startAiHelper() {
  const env = { ...readEnvFile(join(root, '.env')), ...readEnvFile(join(root, '.env.local')), ...process.env };
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
    console.log('  AI teachers: off (optional — add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env.local and restart to turn them on)');
    return () => undefined;
  }
  const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'scripts/ai-helper/main.ts')], { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (code) console.log(`  [ai-helper] stopped (exit ${code}). The school keeps working with on-device teachers.`);
  });
  const stop = () => {
    if (!child.killed) child.kill();
  };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      stop();
      process.exit(0);
    });
  }
  return stop;
}
