#!/bin/bash
set -e

npm install

# Build
npm run build

# We need to gracefully stop the firebase process so it exports on exit

# Trap SIGTERM and SIGINT to gracefully shutdown
trap 'kill -TERM $PID; wait $PID' TERM INT

# Start emulators in background
firebase emulators:start --only functions,storage,database --import=.emulator-data --export-on-exit=.emulator-data &
PID=$!

# Wait for the process
wait $PID
