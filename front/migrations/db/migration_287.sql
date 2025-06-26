-- Migration created on Jun 25, 2025
ALTER TABLE "memberships"
    ADD COLUMN "origin" VARCHAR(255) NOT NULL DEFAULT 'invited';
