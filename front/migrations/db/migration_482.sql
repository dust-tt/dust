-- Migration created on Jan 15, 2026
ALTER TABLE group_vaults ADD COLUMN "kind" VARCHAR(255) NOT NULL DEFAULT 'member';
