-- Migration created on Oct 02, 2024
ALTER TABLE "public"."conversations" ADD COLUMN "groupIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
