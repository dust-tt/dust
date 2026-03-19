-- Migration created on Mar 19, 2026
ALTER TABLE "public"."plans" ADD COLUMN "isAuditLogsAllowed" BOOLEAN DEFAULT false;
