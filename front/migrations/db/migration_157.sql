-- Migration created on Jan 24, 2025
ALTER TABLE "public"."run_usages" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
