-- Migration created on Nov 25, 2024
-- Add support for searching users by email, firstName, and lastName with unaccent

-- Step 1: Enable required extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 2: Create an IMMUTABLE wrapper function for unaccent
-- This is required because unaccent() itself is not marked as IMMUTABLE
-- and PostgreSQL requires IMMUTABLE functions for indexes
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT unaccent($1);
$$;

-- Step 3: Create GIN index for efficient search across email, firstName, and lastName
-- This index will be used for case-insensitive, unaccented search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_search_unaccent ON users USING gin (
  (
    immutable_unaccent(lower(coalesce(email, ''))) || ' ' ||
    immutable_unaccent(lower(coalesce("firstName", ''))) || ' ' ||
    immutable_unaccent(lower(coalesce("lastName", '')))
  ) gin_trgm_ops
);
