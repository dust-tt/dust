-- Migration created on May 27, 2025
ALTER TABLE "public"."plans" ADD COLUMN "isWorkOSAllowed" BOOLEAN DEFAULT false;
