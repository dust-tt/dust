#!/bin/sh

NODE_ENV=stating env $(cat .env.local) npx tsx ./src/start.ts -p 3002
