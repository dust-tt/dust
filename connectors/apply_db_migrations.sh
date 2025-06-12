#!/bin/bash

# Script to apply database migrations
# Usage: ./apply_db_migrations.sh migration_name

# Check if migration name is provided
if [[ -z "$1" ]]; then
    echo "Error: Migration name is required"
    echo "Usage: $0 migration_name"
    exit 1
fi

migration_name="$1"

# Check if DATABASE_URI is set
if [[ -z "$CONNECTORS_DATABASE_URI" ]]; then
    echo "Error: CONNECTORS_DATABASE_URI environment variable is not set"
    exit 1
fi

# Construct full migration path
migration_file="./migrations/db/${migration_name}"

# Check if migration file exists
if [[ ! -f "$migration_file" ]]; then
    echo "Error: Migration file not found: $migration_file"
    exit 1
fi

psql "$CONNECTORS_DATABASE_URI" -f "$migration_file" --set=apply=1
echo ""

if [[ $? -eq 0 ]]; then
    echo "Migration applied successfully: $migration_name"
else
    echo "Error: Failed to apply migration: $migration_name"
    exit 1
fi 