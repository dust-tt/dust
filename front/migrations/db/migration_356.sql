-- Migration created on Sep 11, 2025
ALTER TABLE "public"."user_messages" ADD COLUMN "systemMetadata" JSONB NOT NULL DEFAULT '{}';
