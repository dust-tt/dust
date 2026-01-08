-- Migration created on Jan 06, 2026
-- Add parallel sync support for Google Drive connector

-- Add useParallelSync flag to google_drive_configs table
-- This enables gradual rollout of parallel folder sync feature
ALTER TABLE "google_drive_configs"
  ADD COLUMN "useParallelSync" BOOLEAN NOT NULL DEFAULT FALSE;
