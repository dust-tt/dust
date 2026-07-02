'use strict';
// Runs the profiler script. In the Docker images `front/dist/run_profiler.js` is
// built in CI (see dockerfiles/front.Dockerfile), so production pods run the
// pre-compiled bundle with plain `node` — no TypeScript transform at runtime.
// On developer machines the bundle is absent, so we fall back to `tsx`.
// Mirrors scripts/db/run-migrate.cjs. Path resolution is anchored to this file
// (not cwd) so it works from both front/ and front-api/ (`node
// ../front/scripts/debug/run-profiler.cjs`).
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const frontDir = path.resolve(__dirname, '..', '..');
const compiled = path.join(frontDir, 'dist', 'run_profiler.js');
const source = path.join(frontDir, 'scripts', 'debug', 'run_profiler.ts');

const result = existsSync(compiled)
  ? spawnSync('node', [compiled, ...args], { stdio: 'inherit' })
  : spawnSync('tsx', [source, ...args], { stdio: 'inherit' });

process.exit(result.status ?? 1);
