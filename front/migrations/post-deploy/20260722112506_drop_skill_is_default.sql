/*
Statement 0
  - Plain SET NOT NULL scans the table under an ACCESS EXCLUSIVE lock; acceptable here as the
    table is small. The availability backfill must have run (any remaining NULL fails this).
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ALTER COLUMN "availability" SET NOT NULL;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ALTER COLUMN "availability" SET DEFAULT 'workspace_users'::character varying;

/*
Statement 2
  - INDEX_DROPPED: Replaced by skill_configurations_workspace_id_status_availability (created
    pre-deploy). Dropped explicitly before the column it references.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY IF EXISTS "public"."skill_configurations_workspace_id_status_is_default";

/*
Statement 3
  - DELETES_DATA: Deletes the isDefault column. The availability backfill must have run.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" DROP COLUMN IF EXISTS "isDefault";

/*
Statement 4
  - Plain SET NOT NULL scans the table under an ACCESS EXCLUSIVE lock; acceptable here as the
    table is small. The availability backfill must have run (any remaining NULL fails this).
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" ALTER COLUMN "availability" SET NOT NULL;

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" ALTER COLUMN "availability" SET DEFAULT 'workspace_users'::character varying;

/*
Statement 6
  - DELETES_DATA: Deletes the isDefault column. The availability backfill must have run.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" DROP COLUMN IF EXISTS "isDefault";
