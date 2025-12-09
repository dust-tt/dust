-- Migration created on Dec 02, 2025
ALTER TABLE "public"."credits"
DROP COLUMN IF EXISTS "initialAmountCents";

ALTER TABLE "public"."credits"
DROP COLUMN IF EXISTS "consumedAmountCents";

ALTER TABLE "public"."programmatic_usage_configurations"
DROP COLUMN IF EXISTS "freeCreditCents";

ALTER TABLE "public"."programmatic_usage_configurations"
DROP COLUMN IF EXISTS "paygCapCents";

ALTER TABLE "public"."run_usages" DROP COLUMN IF EXISTS "costUsd";