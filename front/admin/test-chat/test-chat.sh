#!/bin/bash
# Helper script to run the LLM chat tester

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run with ts-node from the front directory
cd "$SCRIPT_DIR/../.." || exit 1

echo "Starting LLM Chat Tester..."
echo ""

# Use ts-node with the front tsconfig which has proper @app alias
npx ts-node -P tsconfig.json "$SCRIPT_DIR/test-chat.ts"

