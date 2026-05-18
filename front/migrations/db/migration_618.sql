-- Migration created on Apr 29, 2026
-- coupons: creditTypeId removed from model
ALTER TABLE "coupons" DROP COLUMN "creditTypeId";
-- coupon_redemptions: new columns added to model
ALTER TABLE "coupon_redemptions"
ADD COLUMN "metronomeCreditIds" VARCHAR(255)[] NOT NULL DEFAULT '{}';
ALTER TABLE "coupon_redemptions"
ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'pending';
-- coupon_redemptions: replace full unique index with partial (active/pending only)
DROP INDEX CONCURRENTLY "coupon_redemptions_coupon_workspace_idx";
CREATE UNIQUE INDEX CONCURRENTLY "coupon_redemptions_coupon_workspace_active_idx" ON "coupon_redemptions" ("couponId", "workspaceId")
WHERE status IN ('pending', 'active');
-- coupons: rename amountMicroUsd to amount and change type from BIGINT to DOUBLE PRECISION
ALTER TABLE "coupons" RENAME COLUMN "amountMicroUsd" TO "amount";
ALTER TABLE "coupons" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;
-- coupons: rename redeemBy to expirationDate
ALTER TABLE "coupons" RENAME COLUMN "redeemBy" TO "expirationDate";