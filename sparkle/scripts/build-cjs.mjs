import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postCssPlugin from 'esbuild-plugin-postcss2';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf-8'));

// Environment variables
const disableTerser = !!process.env.DISABLE_TERSER;
const includeTwBase = !!process.env.INCLUDE_TW_BASE;

console.log(`Building CJS bundle...`);
console.log(`- Minification: ${!disableTerser}`);
console.log(`- Tailwind Base: ${includeTwBase}`);

try {
  await esbuild.build({
    // Input
    entryPoints: ['dist/esm/index.js'],

    // Output
    outfile: pkg.main, // 'dist/cjs/index.js'
    format: 'cjs',
    platform: 'node',
    target: 'es2020',

    // Bundling
    bundle: true,
    splitting: false, // CJS doesn't support code splitting

    // Externals - mark all dependencies and peerDependencies as external
    external: [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ],

    // Minification
    minify: !disableTerser,
    minifyWhitespace: !disableTerser,
    minifyIdentifiers: !disableTerser,
    minifySyntax: !disableTerser,

    // Keep names for better debugging
    keepNames: true,

    // Sourcemaps
    sourcemap: true,

    // Loaders for different file types
    loader: {
      '.css': 'css',
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.json': 'json',
    },

    // PostCSS plugin for Tailwind
    plugins: [
      postCssPlugin.default({
        plugins: [
          tailwindcss({
            config: path.resolve(rootDir, 'tailwind.config.js'),
            corePlugins: {
              preflight: includeTwBase,
            },
          }),
          autoprefixer(),
        ],
        inject: true,  // Inject CSS into JS (same as Rollup)
        extract: false, // Don't extract to separate file
      }),
    ],

    // Additional options
    legalComments: 'none', // Similar to Rollup's comments: false
    treeShaking: true,
  });

  console.log('✓ CJS bundle built successfully');
  console.log(`  Output: ${pkg.main}`);
} catch (error) {
  console.error('✗ CJS build failed:', error);
  process.exit(1);
}
