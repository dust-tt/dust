#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HIVE_ENV_NAME=""

if [[ "$REPO_ROOT" == */.hives/* ]]; then
  HIVE_ENV_NAME="${REPO_ROOT#*/.hives/}"
  HIVE_ENV_NAME="${HIVE_ENV_NAME%%/*}"
elif [[ "$REPO_ROOT" == "$HOME"/dust-hive/* ]]; then
  HIVE_ENV_NAME="${REPO_ROOT#"$HOME"/dust-hive/}"
  HIVE_ENV_NAME="${HIVE_ENV_NAME%%/*}"
fi

if [[ -z "${TEST_FRONT_DATABASE_URI:-}" && -n "$HIVE_ENV_NAME" ]]; then
  HIVE_ENV_FILE="$HOME/.dust-hive/envs/$HIVE_ENV_NAME/env.sh"

  if [[ -f "$HIVE_ENV_FILE" ]]; then
    source "$HIVE_ENV_FILE"
  fi
fi

if [[ -z "${TEST_FRONT_DATABASE_URI:-}" ]]; then
  echo "Error: TEST_FRONT_DATABASE_URI must be set."
  exit 1
fi

if [[ "$TEST_FRONT_DATABASE_URI" != *test* ]]; then
  echo "Error: TEST_FRONT_DATABASE_URI does not look like a test database URI."
  echo "Value: $TEST_FRONT_DATABASE_URI"
  exit 1
fi

DATABASE_NAME="${TEST_FRONT_DATABASE_URI##*/}"
DATABASE_NAME="${DATABASE_NAME%%\?*}"
POSTGRES_URI="${TEST_FRONT_DATABASE_URI%/*}/postgres"

if [[ ! "$DATABASE_NAME" =~ ^[a-zA-Z0-9_]+$ || "$DATABASE_NAME" != *test* ]]; then
  echo "Error: Refusing to reset unexpected database name: $DATABASE_NAME"
  exit 1
fi

echo "Dropping test database: $DATABASE_NAME"
psql "$POSTGRES_URI" -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DATABASE_NAME\" WITH (FORCE);"

echo "Creating test database: $DATABASE_NAME"
psql "$POSTGRES_URI" -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$DATABASE_NAME\";"

echo "Done"
