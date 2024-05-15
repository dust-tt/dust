#!/bin/bash

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


# Pop the stash.
echo "Restoring original changes..."
git stash pop --quiet

# Checkout original branch and run command.
echo "Checking out $original_branch branch..."
git checkout $original_branch --quiet
echo "Running command on $original_branch branch..."
NODE_ENV=development DB_LOGGING_ENABLED=true ./admin/init_db.sh --unsafe > current_output.txt

# Run diff.
echo "Running diff..."
diff --unified=0 --color=always main_output.txt current_output.txt

# Clean up the output files.
echo "Cleaning up temporary files..."
rm main_output.txt current_output.txt

