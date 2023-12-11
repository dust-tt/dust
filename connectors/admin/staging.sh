#!/bin/sh

export NODE_ENV=staging

npx tsx ./src/start.ts -p 3002 2>&1

