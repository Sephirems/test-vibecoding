/**
 * Bundles the extension sources into extension/dist/.
 *
 * Four separate bundles because Chrome loads each context independently:
 * the service worker, the side panel, the options page, and the Readability
 * payload injected into visited pages.
 *
 * Usage: npm run build   (or npm run watch)
 */
import { context } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: {
    background: 'extension/src/background.js',
    sidepanel: 'extension/src/sidepanel.js',
    options: 'extension/src/options.js',
    'readability-inject': 'extension/src/readability-inject.js',
  },
  outdir: 'extension/dist',
  bundle: true,
  // IIFE, not ESM: the service worker is declared without "type": "module",
  // and an injected file must not rely on module loading either.
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  // Never minify: Chrome serialises the injected extraction function as source
  // text, and readable output makes devtools debugging possible.
  minify: false,
  sourcemap: true,
  logLevel: 'info',
};

const ctx = await context(options);

if (watch) {
  await ctx.watch();
  console.log('esbuild: surveillance active (Ctrl+C pour arrêter)');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
