-- Migration created on May 23, 2025
ALTER TABLE "public"."groups" ADD COLUMN IF NOT EXISTS "workOSGroupId" VARCHAR(255);
ALTER TABLE "public"."groups" DROP COLUMN IF EXISTS "directoryId";
CREATE UNIQUE INDEX "groups_workspace_id_work_o_s_group_id" ON "groups" ("workspaceId", "workOSGroupId");

ALTER TABLE "public"."users" ADD COLUMN "workOSUserId" VARCHAR(255);
