-- Migration: Add metronomePackageAlias to plans and metronomeCustomerId to workspaces
-- Part of Metronome billing integration (F1: Data model)

ALTER TABLE plans ADD COLUMN IF NOT EXISTS "metronomePackageAlias" VARCHAR(255) DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS "metronomeCustomerId" VARCHAR(255) DEFAULT NULL;
