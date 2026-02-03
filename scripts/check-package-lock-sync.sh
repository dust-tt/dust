#!/bin/bash

# Script to check if package.json and package-lock.json are in sync for npm workspaces
# Usage: ./check-package-lock-sync.sh
# Returns 0 if in sync, 1 if out of sync

set -e

# Get the root path of the git repository
root_path=$(git rev-parse --show-toplevel)

# Check if package-lock.json exists at the root
if [ ! -f "$root_path/package-lock.json" ]; then
    echo "Error: package-lock.json not found at repository root"
    exit 1
fi

# Save current state of package-lock.json
cp "$root_path/package-lock.json" "$root_path/package-lock.json.backup"

# Run npm install --package-lock-only to regenerate the lock file (suppress output)
cd "$root_path"
if ! npm install --package-lock-only --loglevel=error > /dev/null 2>&1; then
    echo "Error: Failed to run npm install --package-lock-only"
    mv "$root_path/package-lock.json.backup" "$root_path/package-lock.json"
    exit 1
fi

# Check if package-lock.json changed
if ! diff -q "$root_path/package-lock.json" "$root_path/package-lock.json.backup" > /dev/null 2>&1; then
    echo "Error: package.json and package-lock.json are out of sync"
    echo "Please run 'npm install' at the repository root to sync them"
    mv "$root_path/package-lock.json.backup" "$root_path/package-lock.json"
    exit 1
fi

# Restore original package-lock.json
mv "$root_path/package-lock.json.backup" "$root_path/package-lock.json"

echo "✅ package.json and package-lock.json are in sync"
exit 0
