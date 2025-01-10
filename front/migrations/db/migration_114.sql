-- Add version column
ALTER TABLE
    "public"."content_fragments"
ADD
    COLUMN "version" VARCHAR(255) NOT NULL DEFAULT 'latest';

-- Create the composite index concurrently to avoid locking
CREATE INDEX CONCURRENTLY "content_fragments_s_id_version" ON "content_fragments" ("sId", "version");

-- Drop the old single-column index if it exists
DROP INDEX CONCURRENTLY IF EXISTS "content_fragments_s_id";