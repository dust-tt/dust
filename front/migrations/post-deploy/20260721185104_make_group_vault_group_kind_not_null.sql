/*
Post-deploy: make group_vaults.groupKind NOT NULL after the TypeScript backfill has run in every
region.

Validate a temporary CHECK constraint before taking the brief ACCESS EXCLUSIVE lock required by
SET NOT NULL. PostgreSQL can then use the validated constraint instead of scanning the million-row
table while holding that stronger lock.
*/

/* Statement 0: add the temporary constraint without scanning existing rows. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_vaults"
  ADD CONSTRAINT "group_vaults_group_kind_not_null_check"
  CHECK ("groupKind" IS NOT NULL) NOT VALID;

/* Statement 1: validate existing rows without blocking normal reads and writes. */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_vaults"
  VALIDATE CONSTRAINT "group_vaults_group_kind_not_null_check";

/* Statement 2: use the validated constraint to make the column NOT NULL without another scan. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_vaults"
  ALTER COLUMN "groupKind" SET NOT NULL;

/* Statement 3: remove the now-redundant temporary constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_vaults"
  DROP CONSTRAINT "group_vaults_group_kind_not_null_check";
