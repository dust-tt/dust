-- Migration created on Aug 05, 2025
ALTER TABLE "public"."confluence_folders" ADD COLUMN "parentType" VARCHAR(255) DEFAULT NULL;
ALTER TABLE "public"."confluence_pages" ADD COLUMN "parentType" VARCHAR(255) DEFAULT NULL;