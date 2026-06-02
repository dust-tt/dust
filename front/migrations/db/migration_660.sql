-- Migration created on Jun 01, 2026
ALTER TABLE "workspaces" ADD COLUMN "programmaticCreditState" VARCHAR(255) NOT NULL DEFAULT 'active';
