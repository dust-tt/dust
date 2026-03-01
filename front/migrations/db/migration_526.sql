-- Migration created on Mar 01, 2026
ALTER TABLE "public"."plugin_runs" ADD COLUMN "reason" VARCHAR(512);
