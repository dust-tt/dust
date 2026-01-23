#!/bin/bash

# Script to check if package.json and package-lock.json are in sync
# Usage: ./check-package-lock-sync.sh [dir1 dir2 ...]
# If no directories are provided, checks all default directories
# Returns 0 if in sync, 1 if out of sync

set -e

# Get the root path of the git repository
root_path=$(git rev-parse --show-toplevel)

# If arguments are provided, use them as the list of directories to check
# Otherwise, use the default list
if [ $# -gt 0 ]; then
    directories=("$@")
else
    directories=("front" "connectors" "cli" "viz" "sparkle" "extension" "sdks/js")
fi

# Track if any checks failed
failed=0

echo "Checking if package.json and package-lock.json are in sync..."

for directory in "${directories[@]}"; do
    dir_path="$root_path/$directory"

    # Check if directory exists and has both package.json and package-lock.json
    if [ ! -d "$dir_path" ]; then
        continue
    fi

    if [ ! -f "$dir_path/package.json" ] || [ ! -f "$dir_path/package-lock.json" ]; then
        continue
    fi

    # Save current state of package-lock.json
    cp "$dir_path/package-lock.json" "$dir_path/package-lock.json.backup"

    # Run npm install --package-lock-only to regenerate the lock file (suppress output)
    cd "$dir_path"
    if ! npm install --package-lock-only --loglevel=error > /dev/null 2>&1; then
        echo "Error: Failed to run npm install --package-lock-only in $directory"
        mv "$dir_path/package-lock.json.backup" "$dir_path/package-lock.json"
        failed=1
        continue
    fi

    # Check if package-lock.json changed
    if ! diff -q "$dir_path/package-lock.json" "$dir_path/package-lock.json.backup" > /dev/null 2>&1; then
        echo "Error: package.json and package-lock.json are out of sync in $directory"
        echo "Please run 'cd $directory && npm install' to sync them"
        mv "$dir_path/package-lock.json.backup" "$dir_path/package-lock.json"
        failed=1
        continue
    fi

    # Restore original package-lock.json
    mv "$dir_path/package-lock.json.backup" "$dir_path/package-lock.json"
done

if [ $failed -eq 1 ]; then
    echo "❌ Some package.json and package-lock.json files are out of sync"
    exit 1
fi

echo "✅ All package.json and package-lock.json files are in sync"
exit 0
