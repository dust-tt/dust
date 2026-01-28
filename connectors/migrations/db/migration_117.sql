-- Migration created on Jan 22, 2026
ALTER TABLE "google_drive_configs"
DROP COLUMN IF EXISTS "useParallelSync";