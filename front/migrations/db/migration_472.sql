-- Migration created on Jan 12, 2026
-- Rename authorId to editedBy in skill_configurations and skill_versions tables

-- Step 1: Drop existing indexes on authorId
DROP INDEX IF EXISTS "skill_configurations_workspace_id_author_id";
DROP INDEX IF EXISTS "skill_versions_workspace_id_author_id";

-- Step 2: Rename columns
ALTER TABLE "skill_configurations" RENAME COLUMN "authorId" TO "editedBy";
ALTER TABLE "skill_versions" RENAME COLUMN "authorId" TO "editedBy";

-- Step 3: Create new indexes on editedBy (concurrently for production safety)
CREATE INDEX CONCURRENTLY "skill_configurations_workspace_id_edited_by" ON "skill_configurations" ("workspaceId", "editedBy");
CREATE INDEX CONCURRENTLY "skill_versions_workspace_id_edited_by" ON "skill_versions" ("workspaceId", "editedBy");
