-- Migration created on Dec 02, 2025
UPDATE "public"."credits"
SET
    "initialAmountMicroUsd" = "initialAmountCents" * 10000,
    "consumedAmountMicroUsd" = "consumedAmountCents" * 10000
WHERE
    "initialAmountCents" > 0
    AND "initialAmountMicroUsd" = 0;