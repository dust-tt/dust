-- Migration created on Jan 22, 2026
-- Convert urls column from JSONB to JSONB[] (PostgreSQL array of JSONB)
-- Drop and recreate the column to simplify the migration

ALTER TABLE "project_metadata" DROP COLUMN "urls";

ALTER TABLE "project_metadata" ADD COLUMN "urls" JSONB[] NOT NULL DEFAULT ARRAY[]::JSONB[];
