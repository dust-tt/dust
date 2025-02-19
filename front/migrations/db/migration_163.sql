-- Migration created on Jan 24, 2025
ALTER TABLE "public"."workspaces" ADD COLUMN "metadata" JSONB DEFAULT NULL;
