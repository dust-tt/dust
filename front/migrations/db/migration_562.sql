-- Migration: Add spaceId to content_fragments for project knowledge (Step 1)
ALTER TABLE "public"."content_fragments"
ADD COLUMN "spaceId" BIGINT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY "content_fragments_space_id" ON "content_fragments" ("spaceId");

CREATE INDEX CONCURRENTLY "content_fragments_workspace_id_space_id" ON "content_fragments" ("workspaceId", "spaceId");