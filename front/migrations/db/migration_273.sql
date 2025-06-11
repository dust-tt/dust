-- Migration created on Jun 03, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0;
