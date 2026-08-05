/*
Statement 0
  - INDEX_DROPPED: Drops the index on the column
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."project_metadata_provisioning_source";

/*
Statement 1
  - DELETES_DATA: Deletes all values in the column
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" DROP COLUMN "provisioningSource";
