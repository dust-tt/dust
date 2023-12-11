#!/bin/sh
export NODE_ENV="development"
npx tsx ./tests/chat/e2e_eval.ts $*
