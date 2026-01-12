-- Migration created on Jan 09, 2026
ALTER TABLE "public"."mentions" ADD COLUMN "dismissed" BOOLEAN DEFAULT false;
