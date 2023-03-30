#!/bin/sh
env $(cat .env.local) npx tsx init/db.ts

