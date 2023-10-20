#!/bin/sh
env $(cat .env.local) npx tsx admin/init_plans.ts

