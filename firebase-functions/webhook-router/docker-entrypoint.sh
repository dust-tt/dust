#!/bin/bash
set -e

npm install

# Initial build (blocking) to ensure dist/ exists
npm run build

# Start watch mode for subsequent changes
npm run build:watch &

# We need to gracefully stop the firebase process so it exports on exit

# Trap SIGTERM and SIGINT to gracefully shutdown
trap 'kill -TERM $PID; wait $PID' TERM INT

# Start emulators in background
firebase emulators:start --only functions,storage,database --import=.emulator-data --export-on-exit=.emulator-data &
PID=$!

# Wait for the process
wait $PID
