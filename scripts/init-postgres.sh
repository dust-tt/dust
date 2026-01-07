#!/usr/bin/env bash
set -euo pipefail

# Wait for PostgreSQL to be ready
until pg_isready -h localhost -p 5432 -U dev; do
  echo "Waiting for PostgreSQL..."
  sleep 1
done

echo "PostgreSQL is ready!"

# create the 'dev' user if it doesn't exist
psql -h localhost -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='dev'" | grep -q 1 || \
  psql -h localhost -d postgres -c "CREATE USER dev WITH PASSWORD 'dev';"

# Create databases if they don't exist
psql -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'dust_front'" | grep -q 1 || \
  psql -h localhost -d postgres -c "CREATE DATABASE dust_front"

psql -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'dust_connectors'" | grep -q 1 || \
  psql -h localhost -d postgres -c "CREATE DATABASE dust_connectors"

psql -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'dust_core'" | grep -q 1 || \
  psql -h localhost -d postgres -c "CREATE DATABASE dust_core"

psql -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'dust_databases_store'" | grep -q 1 || \
  psql -h localhost -d postgres -c "CREATE DATABASE dust_databases_store"

echo "✅ All databases created!"
