'use strict';
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const compiled = 'dist/migrate.js';

const result = existsSync(compiled)
  ? spawnSync('node', [compiled, ...args], { stdio: 'inherit' })
  : spawnSync('tsx', ['scripts/migrate.ts', ...args], { stdio: 'inherit' });

process.exit(result.status ?? 1);
