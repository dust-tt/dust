-- Migration created on Dec 08, 2025
ALTER TABLE "public"."credits" ADD COLUMN "boughtByUserId" BIGINT DEFAULT NULL REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
