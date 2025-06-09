-- Migration created on Jun 2, 2025

-- Migration created on May 22, 2025
ALTER TABLE "public"."workspaces" ADD COLUMN "workOSOrganizationId" VARCHAR(255);
CREATE UNIQUE INDEX "workspaces_work_o_s_organization_id" ON "workspaces" ("workOSOrganizationId");

-- Migration created on May 23, 2025
ALTER TABLE "public"."groups" ADD COLUMN IF NOT EXISTS "workOSGroupId" VARCHAR(255);
CREATE UNIQUE INDEX "groups_workspace_id_work_o_s_group_id" ON "groups" ("workspaceId", "workOSGroupId");

ALTER TABLE "public"."users" ADD COLUMN "workOSUserId" VARCHAR(255);

-- Migration created on May 28, 2025
CREATE UNIQUE INDEX CONCURRENTLY "users_work_o_s_id" ON "users" ("workOSUserId");
