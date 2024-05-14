#!/bin/sh

NODE_ENV=development npx tsx --import=tsx --trace-warnings ./src/start.ts -p 3002
