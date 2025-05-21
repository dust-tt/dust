-- Migration created on May 21, 2025
ALTER TABLE "public"."gong_configurations" ADD COLUMN "trackersEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "public"."gong_configurations" SET "trackersEnabled" = "smartTrackersEnabled";
