-- Migration: Drop metronomePackageAlias from plans
-- Part of Metronome billing integration (F9) — run AFTER deploy

ALTER TABLE plans DROP COLUMN IF EXISTS "metronomePackageAlias";
