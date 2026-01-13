-- Migration created on Jan 13, 2026
-- Drop the old enabled column after migration to status

ALTER TABLE "triggers" DROP COLUMN "enabled";
