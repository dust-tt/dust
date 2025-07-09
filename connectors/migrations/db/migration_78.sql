-- Migration created on Jun 19, 2025
ALTER TABLE "public"."slack_channels" ADD COLUMN "skipReason" VARCHAR(255);
