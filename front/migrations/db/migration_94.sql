-- Migration created on Sep 27, 2024
ALTER TABLE "public"."plans"
ADD COLUMN "maxVaultsInWorkspace" INTEGER NOT NULL DEFAULT 1;

UPDATE "public"."plans"
SET
    "maxVaultsInWorkspace" = -1
WHERE
    code like 'ENT_%';