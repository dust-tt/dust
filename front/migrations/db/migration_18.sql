-- Migration created on Jun 07, 2024
ALTER TABLE "public"."templates" ADD COLUMN "presetActions" JSONB NOT NULL DEFAULT '[]';
