SET SESSION statement_timeout = 3000;

SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."workspace_seat_limits"
ADD COLUMN "startAt" timestamp with time zone NOT NULL DEFAULT NOW();

ALTER TABLE "public"."workspace_seat_limits"
ADD COLUMN "endAt" timestamp with time zone DEFAULT NULL;

-- Seat-limit windows are whole-hour aligned (Metronome effective dates are
-- whole hours), so floor the backfilled startAt to the top of the hour.
UPDATE "public"."workspace_seat_limits"
SET
  "startAt" = date_trunc('hour', "startAt");

-- Relax the old one-row-per-(workspace, seat type) unique constraint and replace
-- it with a partial unique index scoped to open-ended rows, so that scheduled
-- and historical rows (endAt IS NOT NULL) can coexist for the same seat type.
DROP INDEX CONCURRENTLY IF EXISTS "workspace_seat_limits_workspace_seat_type_idx";

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "workspace_seat_limits_workspace_seat_type_active_idx" ON "public"."workspace_seat_limits" ("workspaceId", "seatType")
WHERE
  "endAt" IS NULL;
