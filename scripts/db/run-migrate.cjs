'use strict';
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const compiled = 'dist/migrate.js';

const command = existsSync(compiled)
  ? { bin: 'node', binArgs: [compiled, ...args] }
  : { bin: 'tsx', binArgs: ['scripts/migrate.ts', ...args] };

const result = spawnSync(command.bin, command.binArgs, { stdio: 'inherit' });

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error(
      `run-migrate: could not find "${command.bin}" on PATH.
      Make sure ${command.bin} is installed and on PATH.`
    );
  } else {
    console.error(`run-migrate: failed to run "${command.bin}": ${result.error.message}`);
  }
  process.exit(1);
}

if (result.signal) {
  console.error(`run-migrate: "${command.bin}" was killed by signal ${result.signal}.`);
  process.exit(1);
}

process.exit(result.status ?? 1);
