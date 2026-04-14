-- Migration created on Apr 09, 2026
-- Add spaceId column to takeaways table to link takeaways to a space (project).

ALTER TABLE "takeaways"
  ADD COLUMN IF NOT EXISTS "spaceId" BIGINT NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "takeaways_spaceId_idx" ON "takeaways" ("spaceId");
