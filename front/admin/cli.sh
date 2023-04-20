#!/bin/sh
env $(cat .env.local) npx tsx admin/cli.ts "$@"

