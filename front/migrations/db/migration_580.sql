-- Migration created on Apr 14, 2026
-- Replace the multi-row versioning pattern (sId + version columns in the main
-- table) with a stable main row + separate version snapshot tables for both
-- project_todos and takeaways.
-- Data is NOT migrated — these tables are truncated before schema changes.

-- Drop old versioning indexes (column drop below would remove them anyway, but
-- explicit drops keep the migration intent clear).
DROP INDEX CONCURRENTLY IF EXISTS "project_todos_sId_version_unique_idx";
DROP INDEX CONCURRENTLY IF EXISTS "project_todos_sId_idx";
DROP INDEX CONCURRENTLY IF EXISTS "project_todos_ws_space_user_version_idx";

ALTER TABLE "project_todos"
    DROP COLUMN IF EXISTS "sId";
ALTER TABLE "project_todos"
    DROP COLUMN IF EXISTS "version";

DROP INDEX CONCURRENTLY IF EXISTS "takeaways_ws_sId_version_unique_idx";
DROP INDEX CONCURRENTLY IF EXISTS "takeaways_sId_idx";

ALTER TABLE "takeaways"
    DROP COLUMN IF EXISTS "sId";
ALTER TABLE "takeaways"
    DROP COLUMN IF EXISTS "version";

-- ── takeaway_sources: replace string reference with integer FK ─────────────
DROP INDEX CONCURRENTLY IF EXISTS "takeaway_sources_ws_takeawaySId_idx";

ALTER TABLE "takeaway_sources"
    DROP COLUMN IF EXISTS "takeawaySId";
