-- Migration created on Apr 09, 2025
ALTER TABLE "public"."salesforce_configurations" ADD COLUMN "usePersonalConnections" BOOLEAN NOT NULL DEFAULT false;
