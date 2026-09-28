/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."tags" ADD COLUMN "deletedAt" timestamp with time zone;
