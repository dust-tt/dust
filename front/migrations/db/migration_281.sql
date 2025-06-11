-- Migration created on Jun 11, 2025
ALTER TABLE "public"."users" ADD COLUMN "lastLoginAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
