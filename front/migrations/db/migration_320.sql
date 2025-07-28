-- Migration created on Jul 25, 2025
ALTER TABLE "public"."files" ADD COLUMN "sharedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
