-- Admin Governance: expand step of the group_permissions "permissionType" -> "grantType" column
-- rename. The physical column is renamed via expand/contract (not a single-shot RENAME COLUMN)
-- because group_permissions is read on the per-message model-resolution path (ModelsTierResource):
-- renaming in one migration would leave old pods querying a gone "permissionType" during the deploy
-- window and break model resolution for every message.
--
-- This pre-deploy step adds the new "grantType" column, installs a trigger that mirrors the two
-- columns on write (so old pods writing "permissionType" and new pods writing "grantType" both
-- produce complete rows during the rollout), backfills existing rows, and builds the new unique
-- index. The post-deploy contract migration drops "permissionType", the trigger, and the old index
-- once every pod runs the new code.

/*
Statement 0: add the new column. Nullable during the transition (the trigger + backfill keep it
populated); the contract migration sets it NOT NULL once "permissionType" is gone.
*/
SET SESSION statement_timeout = 5000;
SET SESSION lock_timeout = 5000;
ALTER TABLE "public"."group_permissions" ADD COLUMN IF NOT EXISTS "grantType" VARCHAR(256);

/*
Statement 1: mirror the two columns on write. Created before the backfill so no concurrent insert
can slip through with a NULL counterpart. Each code version sets exactly one of the columns; the
trigger fills the other before NOT NULL constraints are checked.
*/
CREATE OR REPLACE FUNCTION group_permissions_mirror_grant_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."grantType" IS NULL THEN
    NEW."grantType" := NEW."permissionType";
  END IF;
  IF NEW."permissionType" IS NULL THEN
    NEW."permissionType" := NEW."grantType";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_permissions_mirror_grant_type_trg ON "public"."group_permissions";
CREATE TRIGGER group_permissions_mirror_grant_type_trg
  BEFORE INSERT OR UPDATE ON "public"."group_permissions"
  FOR EACH ROW EXECUTE FUNCTION group_permissions_mirror_grant_type();

/*
Statement 2: backfill existing rows.
*/
SET SESSION statement_timeout = 30000;
SET SESSION lock_timeout = 5000;
UPDATE "public"."group_permissions" SET "grantType" = "permissionType" WHERE "grantType" IS NULL;

/*
Statement 3: new unique index on "grantType", mirroring the existing one on "permissionType". Built
CONCURRENTLY so it does not lock writes. A failed concurrent build leaves an INVALID index behind;
"CREATE ... IF NOT EXISTS" would then skip it on retry and leave uniqueness unenforced (which the
contract step would compound by dropping the legacy index). So drop any leftover first and create
unconditionally — Postgres' recommended recovery for a failed concurrent build. During this window
the legacy "permissionType" unique index still enforces uniqueness. Generous statement_timeout
because a concurrent build can run long on large tables; this table is small today.
*/
SET SESSION statement_timeout = 300000;
SET SESSION lock_timeout = 5000;
DROP INDEX CONCURRENTLY IF EXISTS "group_permissions_group_gtype_rtype_rid_unique";
CREATE UNIQUE INDEX CONCURRENTLY "group_permissions_group_gtype_rtype_rid_unique"
  ON "public"."group_permissions" ("groupId", "grantType", "resourceType", "resourceId");
