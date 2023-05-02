#!/bin/sh
env $(cat .env.local) npx tsx src/admin/cli.ts "$@"