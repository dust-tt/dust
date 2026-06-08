-- Migration created on Jun 8, 2026
DO $$
BEGIN
    CREATE TYPE "public"."enum_plans_maxAwuCreditsTimeframe" AS ENUM (
        'day',
        'week',
        'month',
        'lifetime'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."plans"
ADD COLUMN IF NOT EXISTS "maxAwuCredits" INTEGER NOT NULL DEFAULT -1;

ALTER TABLE "public"."plans"
ADD COLUMN IF NOT EXISTS "maxAwuCreditsTimeframe" "public"."enum_plans_maxAwuCreditsTimeframe" NOT NULL DEFAULT 'lifetime';
