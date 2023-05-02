#!/bin/sh
export NODE_ENV=production
env $(cat .env.local) npx tsx src/admin/cli.ts "$@"

