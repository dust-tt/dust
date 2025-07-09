-- Migration created on Jun 09, 2025
ALTER TABLE "public"."keys" ADD COLUMN "role" VARCHAR(255) NOT NULL DEFAULT 'builder';
UPDATE "keys" SET "role" = 'admin' WHERE "isSystem" = true;