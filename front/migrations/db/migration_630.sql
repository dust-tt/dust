-- Migration created on May 11, 2026
ALTER TABLE "public"."memberships"
ADD COLUMN "seatType" VARCHAR(255) NOT NULL DEFAULT 'free';