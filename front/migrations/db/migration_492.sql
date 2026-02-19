-- Migration created on Jan 23, 2026
ALTER TABLE conversations ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
