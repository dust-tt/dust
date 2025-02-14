#!/bin/bash

# Go to the directory where the script is located
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
cd "${SCRIPT_DIR}"

# Run the MCP server
npx tsx src/index.ts
