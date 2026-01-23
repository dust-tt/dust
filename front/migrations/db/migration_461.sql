-- Migration created on Jan 05, 2026
ALTER TABLE "public"."plans" ADD COLUMN "isDeepDiveAllowed" BOOLEAN NOT NULL DEFAULT true;
