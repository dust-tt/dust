-- Migration created on Jan 08, 2026
ALTER TABLE "public"."files" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
