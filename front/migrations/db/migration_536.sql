-- Migration created on Mar 09, 2026
ALTER TABLE "public"."files" ADD COLUMN "mountFilePath" VARCHAR(4096) DEFAULT NULL;
CREATE UNIQUE INDEX "files_workspace_id_mount_file_path" ON "files" ("workspaceId", "mountFilePath") WHERE "mountFilePath" IS NOT NULL;
