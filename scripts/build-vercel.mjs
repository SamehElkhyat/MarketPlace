/**
 * Bundles the Express app into a single Vercel Function: api/index.js
 *
 * Why not rely on Vercel's TypeScript handling? This package is native ESM with extensionless relative
 * imports (`./app`). Bundling resolves them ahead of time, so the deployed function is plain JavaScript.
 * npm packages stay external (installed by Vercel and traced into the function), which keeps native
 * assets such as swagger-ui-dist working.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: 'linked',
  logLevel: 'info',
});
