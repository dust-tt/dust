-- Migration created on Jul 31, 2024
ALTER TABLE "public"."keys" ADD COLUMN "groupId" INTEGER REFERENCES "groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
