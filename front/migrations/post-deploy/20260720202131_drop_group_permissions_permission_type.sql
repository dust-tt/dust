-- Admin Governance: contract step of the group_permissions "permissionType" -> "grantType" column
-- rename. Runs AFTER the expand step (pre-deploy) is deployed and every pod is on the new code that
-- reads/writes "grantType". Drops the mirror trigger + function, the legacy "permissionType" column
-- and its unique index, and makes "grantType" NOT NULL.

/*
Statement 0: drop the mirror trigger and its function — no code writes "permissionType" anymore.
*/
SET SESSION statement_timeout = 5000;
SET SESSION lock_timeout = 5000;
DROP TRIGGER IF EXISTS group_permissions_mirror_grant_type_trg ON "public"."group_permissions";
DROP FUNCTION IF EXISTS group_permissions_mirror_grant_type();

/*
Statement 1: drop the legacy unique index on "permissionType" (CONCURRENTLY, no table lock) before
the column drop so the ACCESS EXCLUSIVE window is the column drop alone.
*/
DROP INDEX CONCURRENTLY IF EXISTS "group_permissions_group_ptype_rtype_rid_unique";

/*
Statement 2: drop the legacy column (metadata-only; its dependent index is already gone).
*/
SET SESSION statement_timeout = 5000;
SET SESSION lock_timeout = 5000;
ALTER TABLE "public"."group_permissions" DROP COLUMN IF EXISTS "permissionType";

/*
Statement 3: enforce NOT NULL on the new column. The expand backfill + mirror trigger guaranteed
every row is populated. The verifying scan takes a brief ACCESS EXCLUSIVE lock; group_permissions is
small (admin-created grants), so this is fast.
*/
SET SESSION statement_timeout = 30000;
SET SESSION lock_timeout = 5000;
ALTER TABLE "public"."group_permissions" ALTER COLUMN "grantType" SET NOT NULL;
