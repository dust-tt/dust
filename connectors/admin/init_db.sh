#!/bin/bash

# Default to safe mode
SAFE_MODE=1

BRANCH_NAME=main

# Check environment variable to allow unsafe operations
if [[ $ALLOW_UNSAFE_INITDB == "true" ]]; then
    SAFE_MODE=0
fi

# Parse command line arguments for '--unsafe' flag
for arg in "$@"
do
    if [[ $arg == "--unsafe" ]]; then
        SAFE_MODE=0
        break
    fi
done

# If in safe mode, ensure the repository is on the main branch and up-to-date
if [[ $SAFE_MODE -eq 1 ]]; then
    # Check if on main branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [[ $CURRENT_BRANCH != "$BRANCH_NAME" ]]; then
        echo "Error: Not on main branch. Aborting."
        exit 1
    fi

    # Check if local is up-to-date with remote main
    git fetch origin "$BRANCH_NAME" && git diff --exit-code "origin/$BRANCH_NAME" > /dev/null
    if [ $? -ne 0 ]; then
        echo "Error: Local branch is not up-to-date with remote "$BRANCH_NAME". Aborting."
        exit 1
    else
        echo "Local branch is up-to-date with remote "$BRANCH_NAME"."
    fi
fi


# Database initialization procedures go here
npx tsx src/admin/db.ts
