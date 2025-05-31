-- Migration created on May 22, 2025
ALTER TABLE "public"."workspaces" ADD COLUMN "workOSOrganizationId" VARCHAR(255);
CREATE UNIQUE INDEX "workspaces_work_o_s_organization_id" ON "workspaces" ("workOSOrganizationId");
