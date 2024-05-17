#!/bin/bash

# Ensure NODE_ENV is not set to production.
if [ "$NODE_ENV" == "production" ]; then
  echo "Error: NODE_ENV is set to production. Aborting script."
  exit 1
fi

cleanup() {
    echo "Cleaning up temporary files..."
    rm -f main_output.txt current_output.txt
    exit 0
}

# CLEANUP TEMP FILES ON EXIT
trap 'cleanup' SIGINT SIGTERM EXIT

# Get current date in a human-readable format (e.g., May 28, 2024)
current_date=$(date +"%b %d, %Y")

# Stash any uncommitted changes.
echo "Stashing uncommitted changes..."
git stash push -m "Temp stash for running diff" --quiet

# Get the current branch name.
original_branch=$(git symbolic-ref --short HEAD)
echo "Original branch: $original_branch"

# Checkout main branch and reset DB state to main.
echo "Checking out main branch and resetting DB state..."
git checkout main --quiet
echo "First run: Resetting DB to main branch state..."
NODE_ENV=development DB_LOGGING_ENABLED=true ./admin/init_db.sh --unsafe > main_output.txt

# Run the command a second time to capture the stable production state.
echo "Second run: Capturing stable production state..."
NODE_ENV=development DB_LOGGING_ENABLED=true ./admin/init_db.sh --unsafe > main_output.txt

# Determine if there were any stashed changes.
stash_list=$(git stash list)
if [[ $stash_list == *"Temp stash for running diff"* ]]; then
  # Pop the stash if it exists.
  echo "Restoring original changes..."
  git stash pop --quiet
fi

# Checkout original branch and run command.
echo "Checking out $original_branch branch..."
git checkout $original_branch --quiet
echo "Running command on $original_branch branch..."
NODE_ENV=development DB_LOGGING_ENABLED=true ./admin/init_db.sh --unsafe > current_output.txt

# Run diff.
echo "Running diff..."
diff --unified=0 --color=always main_output.txt current_output.txt

# Run diff and extract only SQL statements, ensuring they end with a semicolon.
echo "Running diff and extracting SQL statements..."
diff_output=$(diff --unified=0 main_output.txt current_output.txt | awk '/^\+[^+]/ {print substr($0, 2)}') | sed 's/;*$/;/'
if [ -n "$diff_output" ]; then
  echo "-- Migration created on $current_date" > diff_output.txt
  echo "$diff_output" >> diff_output.txt
else
    echo "No migration necessary."
    exit 0
fi

# Find the last migration version.
last_version=$(ls ./migrations/db | grep -oE 'migration_([0-9]+).sql' | grep -oE '([0-9]+)\.sql$' | sed s/\.sql// | sort -n | tail -n1)
# 10# ensures the number is interpreted as base-10, preventing errors with leading zeros.
next_version=$(printf "%02d" $((10#$last_version + 1)))
echo "Creating SQL migration $next_version."

# Save the latest changes to a new migration file.
mv diff_output.txt "./migrations/db/migration_${next_version}.sql"
