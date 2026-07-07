/*
Post-deploy: make credit_usage_configurations."programmaticMonthlyCapAwuCredits"
NOT NULL with a default of 0.

The programmatic monthly cap no longer has a "no cap / unlimited" (NULL) state:
0 blocks all programmatic access and a positive value is the monthly cap.
Backfill any legacy NULL rows to 0 (no access) before applying the NOT NULL
constraint. Run after the code that never writes NULL is live.
 */
UPDATE "public"."credit_usage_configurations"
SET "programmaticMonthlyCapAwuCredits" = 0
WHERE "programmaticMonthlyCapAwuCredits" IS NULL;

ALTER TABLE "public"."credit_usage_configurations"
    ALTER COLUMN "programmaticMonthlyCapAwuCredits" SET DEFAULT 0;

ALTER TABLE "public"."credit_usage_configurations"
    ALTER COLUMN "programmaticMonthlyCapAwuCredits" SET NOT NULL;
