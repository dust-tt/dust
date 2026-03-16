<<<<<<< HEAD
-- Migration: Add metronomePackageAlias to plans and metronomeCustomerId to workspaces
-- Part of Metronome billing integration (F1: Data model)

ALTER TABLE plans ADD COLUMN IF NOT EXISTS "metronomePackageAlias" VARCHAR(255) DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS "metronomeCustomerId" VARCHAR(255) DEFAULT NULL;
||||||| parent of 46db7e2490 ([front] enh: Instrument sandbox state transitions)
=======
-- Migration created on Mar 16, 2026
ALTER TABLE "public"."sandboxes" ADD COLUMN "statusChangedAt" TIMESTAMP WITH TIME ZONE;
>>>>>>> 46db7e2490 ([front] enh: Instrument sandbox state transitions)
