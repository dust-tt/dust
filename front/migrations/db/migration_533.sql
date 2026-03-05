-- Migration created on Mar 05, 2026
ALTER TABLE "public"."plans" ADD COLUMN "isByok" BOOLEAN DEFAULT false;
