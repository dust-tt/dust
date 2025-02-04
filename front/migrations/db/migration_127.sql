-- Migration created on Dec 06, 2024
ALTER TABLE "public"."tracker_configurations" ADD COLUMN "name" VARCHAR(255) NOT NULL;
ALTER TABLE "public"."tracker_configurations" ADD COLUMN "description" TEXT;
