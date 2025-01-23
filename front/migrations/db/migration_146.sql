-- Migration created on Jan 23, 2025
ALTER TABLE "public"."tracker_data_source_configurations" ADD COLUMN "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."tracker_generations" ADD COLUMN "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;