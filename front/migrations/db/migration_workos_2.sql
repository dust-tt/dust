-- Migration created on May 23, 2025
ALTER TABLE "public"."groups" ADD COLUMN "workOSGroupId" VARCHAR(255);
ALTER TABLE "public"."groups" ADD COLUMN "directoryId" VARCHAR(255);
CREATE UNIQUE INDEX "groups_workspace_id_work_o_s_group_id" ON "groups" ("workspaceId", "workOSGroupId");
