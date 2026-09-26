// Development server with rebuild-on-save and live reload: `npm run dev`
import * as esbuild from 'esbuild';
import { rmSync, watch } from 'node:fs';
import { join } from 'node:path';
import { copyPublic, ensureDir, esbuildOptions, root, writeIndexHtml } from './esbuild.shared.mjs';

const outdir = join(root, '.dev');
const port = Number(process.env.PORT ?? 5173);

rmSync(outdir, { recursive: true, force: true });
ensureDir(outdir);
copyPublic(outdir);

const htmlPlugin = {
  name: 'write-index-html',
  setup(build) {
    build.onEnd((result) => {
      if (result.metafile) writeIndexHtml(outdir, result.metafile, { liveReload: true });
    });
  },
};

const ctx = await esbuild.context({
  ...esbuildOptions({ mode: 'development', outdir }),
  plugins: [htmlPlugin],
});
await ctx.watch();
const { hosts } = await ctx.serve({ servedir: outdir, port, host: '127.0.0.1' });

// Re-copy static files when public/ or index.html change.
watch(join(root, 'public'), { recursive: true }, () => copyPublic(outdir));
watch(join(root, 'index.html'), () => ctx.rebuild());

console.log(`\n  Izzy's Virtual Classroom → http://${hosts[0]}:${port}\n`);
