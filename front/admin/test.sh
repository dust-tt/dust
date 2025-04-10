#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check that we have TEST_FRONT_DATABASE_URI set
if [ -z "$TEST_FRONT_DATABASE_URI" ]; then
    echo "Error: TEST_FRONT_DATABASE_URI is not set"
    exit 1
fi

# Init the test db
echo "Syncing test db schemas..."
NODE_ENV=test FRONT_DATABASE_URI=$TEST_FRONT_DATABASE_URI npx tsx "$SCRIPT_DIR/db.ts"

# Start the tests
NODE_ENV=test FRONT_DATABASE_URI=$TEST_FRONT_DATABASE_URI npm run test
