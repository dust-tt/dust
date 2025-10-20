#!/bin/bash
source ~/.config/dust/dustrc
# Helper script to run the LLM chat tester

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run with ts-node from the front directory
cd "$SCRIPT_DIR/../.." || exit 1

echo "Starting LLM Chat Tester..."
echo ""

# Use ts-node with the front tsconfig which has proper @app alias
if command -v tsx &> /dev/null; then
    tsx "$SCRIPT_DIR/test-chat.ts"
elif [ -f "./node_modules/.bin/tsx" ]; then
    ./node_modules/.bin/tsx "$SCRIPT_DIR/test-chat.ts"
elif [ -f "./node_modules/.bin/ts-node" ]; then
    ./node_modules/.bin/ts-node -P tsconfig.json "$SCRIPT_DIR/test-chat.ts"
else
    echo "Error: Neither tsx nor ts-node found."
    exit 1
fi
