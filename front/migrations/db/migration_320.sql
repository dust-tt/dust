-- Migration created on Jul 25, 2025
ALTER TABLE "public"."files" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
