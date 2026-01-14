-- Migration created on Jan 13, 2026
-- Add status column and migrate from enabled boolean to status string

-- Step 1: Add the new status column with a default value
ALTER TABLE "triggers" ADD COLUMN "status" VARCHAR(255);

-- Step 2: Migrate existing data from enabled to status
UPDATE "triggers" SET "status" = CASE WHEN "enabled" = true THEN 'enabled' ELSE 'disabled' END;

-- Step 3: Make the column NOT NULL after migration
ALTER TABLE "triggers" ALTER COLUMN "status" SET NOT NULL;
