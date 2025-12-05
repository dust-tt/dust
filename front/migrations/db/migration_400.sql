-- Migration created on Oct 22, 2025
ALTER TABLE "public"."mentions"
    ADD COLUMN "userId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
