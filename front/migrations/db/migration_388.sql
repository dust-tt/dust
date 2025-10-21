-- Migration created on Oct 21, 2025
ALTER TABLE "public"."triggers" ADD COLUMN "naturalLanguageDescription" TEXT DEFAULT NULL;
