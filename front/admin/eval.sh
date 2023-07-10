#!/bin/sh
export NODE_ENV="development"
env $(cat .env.local) npx tsx ./tests/chat/e2e_eval.ts $*
