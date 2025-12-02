-- Migration created on Dec 02, 2025
ALTER TABLE "public"."credits"
ADD COLUMN "initialAmountMicroUsd" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "public"."credits"
ADD COLUMN "consumedAmountMicroUsd" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "public"."credits"
ALTER COLUMN "initialAmountCents"
DROP NOT NULL;

ALTER TABLE "public"."credits"
ALTER COLUMN "consumedAmountCents"
DROP NOT NULL;

-- Drop the old partial index that referenced remainingAmount
DROP INDEX IF EXISTS "credits_nonzero_remaining_idx";

-- Recreate partial index with new column name (consumedAmountCents < initialAmountCents means credit still available)
CREATE INDEX "credits_nonzero_remaining_idx" ON "credits" (
    "workspaceId",
    "expirationDate"
)
WHERE
    "consumedAmountMicroUsd" < "initialAmountMicroUsd";