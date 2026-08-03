/*
Post-deploy: drop legacy authorized_file_access columns after FK backfill.
Requires PR1 cleanup + PR2 backfill to have run before this migration.
 */
DROP INDEX CONCURRENTLY IF EXISTS "authorized_file_accesses_shareable_file_id_non_revoked";

ALTER TABLE "public"."authorized_file_accesses"
    DROP COLUMN "computedByUserId";

ALTER TABLE "public"."authorized_file_accesses"
    DROP COLUMN "revokedAt";