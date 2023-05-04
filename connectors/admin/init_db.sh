#!/bin/sh
env $(cat .env.local) npx tsx src/admin/db.ts