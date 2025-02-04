-- Migration created on Jan 02, 2025
ALTER TABLE "public"."slack_configurations" ADD COLUMN "autoReadChannelPatterns" JSONB DEFAULT '[]';
