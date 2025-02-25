-- Migration created on Feb 25, 2025
ALTER TABLE "public"."connectors" ADD COLUMN "useProxy" BOOLEAN NOT NULL DEFAULT false;
