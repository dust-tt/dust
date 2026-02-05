-- Migration: Remove urls column from project_metadata table
-- 2026-02-05

ALTER TABLE "project_metadata" DROP COLUMN IF EXISTS "urls";
