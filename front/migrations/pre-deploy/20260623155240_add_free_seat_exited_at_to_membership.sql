/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."memberships" ADD COLUMN "freeSeatExitedAt" timestamp with time zone;
