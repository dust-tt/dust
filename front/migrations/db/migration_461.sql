-- Migration created on Jan 02, 2026
ALTER TABLE "public"."user_metadata" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS user_metadata_user_id_key;
CREATE UNIQUE INDEX "user_metadata_user_id_workspace_id_key" ON "user_metadata" ("userId", "workspaceId", "key");
