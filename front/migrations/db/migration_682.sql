-- Migration created on Jun 16, 2026
-- Workspace monthly cap on programmatic (API) AWU consumption, in AWU credits.
-- Stored on credit_usage_configurations as the source of truth; the four
-- Metronome programmatic alerts (cap/warning/low/critical) are derived from it.
-- NULL means no cap is configured; 0 is a meaningful hard cap at zero.
SET statement_timeout = '2s';
SET lock_timeout = '2s';
ALTER TABLE "public"."credit_usage_configurations" ADD COLUMN "programmaticMonthlyCapAwuCredits" INTEGER;
