-- Migration created on May 14, 2025
ALTER TABLE "public"."tags" ADD COLUMN "reserved" BOOLEAN NOT NULL DEFAULT false;
