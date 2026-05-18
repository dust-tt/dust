-- Migration created on Apr 29, 2026
CREATE TABLE IF NOT EXISTS "coupons" (
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "description" VARCHAR(255),
    "discountType" VARCHAR(32) NOT NULL,
    "creditTypeId" VARCHAR(64) NOT NULL,
    "amountMicroUsd" BIGINT NOT NULL,
    "durationMonths" INTEGER DEFAULT NULL,
    "maxRedemptions" INTEGER DEFAULT NULL,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "redeemBy" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "archivedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "id" BIGSERIAL,
    "createdByUserId" BIGINT REFERENCES "users" ("id") ON DELETE
    SET NULL ON UPDATE CASCADE,
        PRIMARY KEY ("id")
);
CREATE INDEX CONCURRENTLY "coupons_created_by_user_idx" ON "coupons" ("createdByUserId");
CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "redeemedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" BIGSERIAL,
    "couponId" BIGINT NOT NULL REFERENCES "coupons" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "redeemedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE
    SET NULL ON UPDATE CASCADE,
        PRIMARY KEY ("id")
);
CREATE INDEX CONCURRENTLY "coupon_redemptions_workspace_idx" ON "coupon_redemptions" ("workspaceId");
CREATE INDEX CONCURRENTLY "coupon_redemptions_coupon_idx" ON "coupon_redemptions" ("couponId");
CREATE INDEX CONCURRENTLY "coupon_redemptions_redeemed_by_user_idx" ON "coupon_redemptions" ("redeemedByUserId");
CREATE UNIQUE INDEX CONCURRENTLY "coupon_redemptions_coupon_workspace_idx" ON "coupon_redemptions" ("couponId", "workspaceId");