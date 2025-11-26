-- Migration created on Nov 21, 2025
-- Rename credit amount fields and add discount column
-- Rename initialAmount -> initialAmountCents
-- Rename remainingAmount -> consumedAmountCents (logic reversal: tracking consumed instead of remaining)
-- Add discount column for promotional discounts

-- Rename initialAmount to initialAmountCents
ALTER TABLE "public"."credits" RENAME COLUMN "initialAmount" TO "initialAmountCents";

-- Rename remainingAmount to consumedAmountCents
ALTER TABLE "public"."credits" RENAME COLUMN "remainingAmount" TO "consumedAmountCents";

-- Add discount column (nullable integer percentage 0-100)
ALTER TABLE "public"."credits" ADD COLUMN "discount" INTEGER CHECK ("discount" >= 0 AND "discount" <= 100);

-- Drop the old partial index that referenced remainingAmount
DROP INDEX IF EXISTS "credits_nonzero_remaining_idx";

-- Recreate partial index with new column name (consumedAmountCents < initialAmountCents means credit still available)
CREATE INDEX "credits_nonzero_remaining_idx"
  ON "credits" ("workspaceId", "expirationDate")
  WHERE "consumedAmountCents" < "initialAmountCents";
