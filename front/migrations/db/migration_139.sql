-- Migration created on Jan 07, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "lastUserMessageAt" TIMESTAMP WITH TIME ZONE;
