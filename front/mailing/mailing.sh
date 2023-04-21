#!/bin/sh
env $(cat .env.local) npx tsx mailing/$1.ts