-- Migration created on Oct 07, 2025

-- First add columns as nullable
ALTER TABLE "webhook_sources_views"
ADD COLUMN "description" TEXT,
ADD COLUMN "icon" VARCHAR(255);

-- Update existing rows with default values
UPDATE "webhook_sources_views"
SET "description" = '',
    "icon" = 'ActionGlobeAltIcon'
WHERE "description" IS NULL OR "icon" IS NULL;

-- Now make the columns NOT NULL (no default at DB level)
ALTER TABLE "webhook_sources_views"
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "icon" SET NOT NULL;
