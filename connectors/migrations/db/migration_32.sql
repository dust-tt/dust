-- Migration created on Nov 08, 2024
ALTER TABLE "public"."slack_channels" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT false;
