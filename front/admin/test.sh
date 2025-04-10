#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check that we have TEST_FRONT_DATABASE_URI set
if [ -z "$TEST_FRONT_DATABASE_URI" ]; then
    echo "Error: TEST_FRONT_DATABASE_URI is not set"
    exit 1
fi

# Init the test db
echo "Synching test db schemas..."
NODE_ENV=TEST FRONT_DATABASE_URI=$TEST_FRONT_DATABASE_URI npx tsx "$SCRIPT_DIR/db.ts"
echo "Syncing test db schemas..."

# Start the tests
FRONT_DATABASE_URI=$TEST_FRONT_DATABASE_URI npm run test
