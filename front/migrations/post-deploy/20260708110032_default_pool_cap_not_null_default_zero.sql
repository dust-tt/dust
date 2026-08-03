/*
Post-deploy: make credit_usage_configurations."defaultPoolCapAwuCredits"
NOT NULL with a default of 0.

The workspace-wide default per-user pool cap has no "unlimited" state and no
plan-tier fallback: 0 removes pool access and a positive value is the cap
(resolution order: per-user override -> group cap -> this workspace default).
NULL was already coerced to 0 in every read path, so this only makes the column
consistent with that behavior. Backfill legacy NULL rows to 0 before applying
the NOT NULL constraint. Run after the code that never writes NULL is live.
 */
UPDATE "public"."credit_usage_configurations"
SET "defaultPoolCapAwuCredits" = 0
WHERE "defaultPoolCapAwuCredits" IS NULL;

ALTER TABLE "public"."credit_usage_configurations"
    ALTER COLUMN "defaultPoolCapAwuCredits" SET DEFAULT 0;

ALTER TABLE "public"."credit_usage_configurations"
    ALTER COLUMN "defaultPoolCapAwuCredits" SET NOT NULL;
