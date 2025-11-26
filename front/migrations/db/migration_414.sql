-- Migration created on Oct 24, 2025
ALTER TABLE "public"."conversations"
ADD COLUMN "spaceId" BIGINT DEFAULT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY "conversations_workspace_id_space_id" ON "conversations" ("workspaceId", "spaceId");
