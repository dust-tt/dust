-- Migration created on Jun 01, 2026
-- Drop the credit-cap-warning notification columns from
-- credit_usage_configurations. These settings are now derived from (and stored
-- as) the workspace's Metronome balance-threshold alert, with reads cached in
-- Redis — so there is no longer a DB copy to keep in sync.
--   - "disableCreditCapWarning" (added in migration_654) is removed; it was
--     never consumed by any email path.

ALTER TABLE "public"."credit_usage_configurations"
  DROP COLUMN IF EXISTS "disableCreditCapWarning";

