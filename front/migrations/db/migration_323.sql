-- Migration created on Jul 30, 2025
ALTER TABLE "public"."plans" ADD COLUMN "isSSOAllowed" BOOLEAN DEFAULT false;
ALTER TABLE "public"."plans" ADD COLUMN "isSCIMAllowed" BOOLEAN DEFAULT false;
