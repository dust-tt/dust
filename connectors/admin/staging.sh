#!/bin/sh

export NODE_ENV=staging

env $(cat .env.local) npx tsx ./src/start.ts -p 3002 2>&1

