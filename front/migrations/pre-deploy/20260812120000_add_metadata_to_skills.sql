/*
Add a nullable, client-owned `metadata` JSONB label map to skills and their versions.
Nullable with no default, so no backfill is required.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ADD COLUMN "metadata" jsonb;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" ADD COLUMN "metadata" jsonb;
