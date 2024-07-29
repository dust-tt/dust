-- Migration created on Jul 29, 2024
ALTER TABLE "public"."microsoft_configurations" ADD COLUMN "csvEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."google_drive_configs" ADD COLUMN "csvEnabled" BOOLEAN NOT NULL DEFAULT false;
[14:02:19.800] INFO (13747): Done;
