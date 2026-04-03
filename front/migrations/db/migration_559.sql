-- Migration created on Apr 1, 2026
-- Add sId as a stable identifier for project todos across versions.
-- Each logical todo keeps the same sId regardless of how many times it is edited;
-- (sId, version) is the unique key, mirroring the AgentConfiguration pattern.

ALTER TABLE "project_todos"
    ADD COLUMN "sId" VARCHAR(255);

-- Backfill existing rows (dev data only — no production rows exist yet).
UPDATE "project_todos"
SET "sId" = id::text
WHERE "sId" IS NULL;

ALTER TABLE "project_todos"
    ALTER COLUMN "sId" SET NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY "project_todos_sId_version_unique_idx" ON "project_todos" ("workspaceId", "sId", "version");
CREATE INDEX CONCURRENTLY "project_todos_sId_idx" ON "project_todos" ("sId");

