-- Migration created on Dec 02, 2025
UPDATE "public"."credits"
SET
    "initialAmountMicroUsd" = "initialAmountCents" * 10000,
    "consumedAmountMicroUsd" = "consumedAmountCents" * 10000
WHERE
    "initialAmountCents" > 0
    AND "initialAmountMicroUsd" = 0;

UPDATE "public"."programmatic_usage_configurations"
SET
    "paygCapMicroUsd" = "paygCapCents" * 10000
WHERE
    "paygCapCents" IS NOT NULL
    AND "paygCapMicroUsd" IS NULL;

UPDATE "public"."programmatic_usage_configurations"
SET
    "freeCreditMicroUsd" = "freeCreditCents" * 10000
WHERE
    "freeCreditCents" IS NOT NULL
    AND "freeCreditMicroUsd" IS NULL;