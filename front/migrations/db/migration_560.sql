-- Migration: Add metronomeContractId to subscriptions
-- Part of Metronome billing integration (F9) — run BEFORE deploy

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "metronomeContractId" VARCHAR(255) DEFAULT NULL;
