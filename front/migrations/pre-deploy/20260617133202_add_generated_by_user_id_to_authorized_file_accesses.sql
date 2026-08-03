/*
Adds a nullable FK from authorized_file_accesses to users for the authoring user.
Legacy computedByUserId (user sId string) is kept during the double-write phase.
 */
SET
    SESSION statement_timeout = '2s';

SET
    SESSION lock_timeout = '2s';

ALTER TABLE "public"."authorized_file_accesses"
ADD COLUMN "generatedByUserId" BIGINT;

ALTER TABLE "public"."authorized_file_accesses" ADD CONSTRAINT "authorized_file_accesses_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE "public"."authorized_file_accesses" VALIDATE CONSTRAINT "authorized_file_accesses_generatedByUserId_fkey";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "authorized_file_accesses_generatedByUserId_idx" ON "public"."authorized_file_accesses" ("generatedByUserId");