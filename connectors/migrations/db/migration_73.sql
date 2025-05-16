-- Migration created on May 16, 2025
ALTER TABLE "public"."gong_configurations"
ADD COLUMN "smartTrackersEnabled" BOOLEAN NOT NULL DEFAULT false;
