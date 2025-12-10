#!/bin/sh
if [ -f "dist/cli.js" ]; then
  node dist/cli.js "$@"
else
  npx tsx src/admin/cli.ts "$@"
fi
