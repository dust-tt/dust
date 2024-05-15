#!/bin/bash

# Stash any uncommitted changes.
echo "Stashing uncommitted changes..."
git stash push -m "Temp stash for running diff"

# Get the current branch name.
original_branch=$(git symbolic-ref --short HEAD)
echo "Original branch: $original_branch"

# Checkout main branch and run command.
echo "Checking out main branch..."
git checkout main
echo "Running command on main branch..."
NODE_ENV=development DB_LOGGING_ENABLED=true ./admin/init_db.sh --unsafe > main_output.txt

# Checkout original branch and run command.
echo "Checking out $original_branch branch..."
git checkout $original_branch
echo "Running command on $original_branch branch..."
NODE_ENV=development DB_LOGGING_ENABLED=true ./admin/init_db.sh --unsafe > current_output.txt

# Pop the stash.
echo "Restoring original changes..."
git stash pop

# Run diff.
echo "Running diff..."
diff --unified=0 main_output.txt current_output.txt

# Clean up the output files.
echo "Cleaning up temporary files..."
rm main_output.txt current_output.txt

