-- Migration created on Jun 8, 2026
ALTER TABLE "public"."plans"
ADD COLUMN IF NOT EXISTS "maxAwuCredits" INTEGER NOT NULL DEFAULT -1;

ALTER TABLE "public"."plans"
ADD COLUMN IF NOT EXISTS "maxAwuCreditsTimeframe" VARCHAR(255) NOT NULL DEFAULT 'lifetime';
