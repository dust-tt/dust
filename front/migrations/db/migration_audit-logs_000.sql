-- Migration created on Jan 08, 2026
ALTER TABLE "public"."plans" ADD COLUMN "isAuditLogsAllowed" BOOLEAN DEFAULT false;
