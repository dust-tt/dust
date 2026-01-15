-- Migration: Fix project_metadata foreign key columns to use BIGINT
ALTER TABLE "project_metadata" ALTER COLUMN "workspaceId" TYPE BIGINT;
ALTER TABLE "project_metadata" ALTER COLUMN "spaceId" TYPE BIGINT;
