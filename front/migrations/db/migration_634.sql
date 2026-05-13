-- Migration created on May 12, 2026
-- Switch memberships.seatType default from 'free' to 'workspace' and
-- backfill existing rows that were created under the previous default.
ALTER TABLE "public"."memberships"
ALTER COLUMN "seatType" SET DEFAULT 'workspace';

UPDATE "public"."memberships"
SET "seatType" = 'workspace'
WHERE "seatType" = 'free';
