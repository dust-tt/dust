-- Migration created on May 14, 2025
ALTER TABLE "public"."slack_messages" ADD COLUMN "skipReason" VARCHAR(255);

