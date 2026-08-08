/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP CONSTRAINT "activation_nudges_spaceId_fkey";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP CONSTRAINT "activation_nudges_triggerId_fkey";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP CONSTRAINT "activation_nudges_userId_fkey";

/*
Statement 3
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."activation_nudges_space_id";

/*
Statement 4
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."activation_nudges_trigger_id";

/*
Statement 5
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."activation_nudges_user_id";

/*
Hand-written: delete nudges that predate ActivationPod (no backfill is run for them) so the
NOT NULL constraint below can be applied.
  - DELETES_DATA: Deletes rows with a NULL activationPodId.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
DELETE FROM "public"."activation_nudges" WHERE "activationPodId" IS NULL;

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_tmp_not_null_check" CHECK("activationPodId" IS NOT NULL) NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_tmp_not_null_check";

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ALTER COLUMN "activationPodId" SET NOT NULL;

/*
Statement 9
  - DELETES_DATA: Deletes all values in the column
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP COLUMN "spaceId";

/*
Statement 10
  - DELETES_DATA: Deletes all values in the column
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP COLUMN "triggerId";

/*
Statement 11
  - DELETES_DATA: Deletes all values in the column
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP COLUMN "userId";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP CONSTRAINT "activation_nudges_tmp_not_null_check";
