-- Migration created on Jul 04, 2024
ALTER TABLE "public"."files" DROP COLUMN "sId";
CREATE INDEX "files_workspace_id_id" ON "files" ("workspaceId", "id");
