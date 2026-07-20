SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandboxes" ADD COLUMN "lastRuntimeRefreshAt" timestamp with time zone;
