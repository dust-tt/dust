#!/usr/bin/env bash
# Run dust-hive tests in a Linux Docker container
# Usage: ./tests/linux/run-tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building Linux test container..."
docker build -t dust-hive-linux-test -f "$SCRIPT_DIR/Dockerfile" "$PROJECT_DIR"

echo ""
echo "Running tests in Linux container..."
docker run --rm dust-hive-linux-test

echo ""
echo "Linux tests completed successfully!"
