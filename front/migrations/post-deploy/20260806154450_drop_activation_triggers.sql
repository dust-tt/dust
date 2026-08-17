/*
Statement 0
  - DELETES_DATA: Deletes all rows in the table (and the table itself)
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP TABLE "public"."activation_nudges";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" DROP CONSTRAINT "activation_pods_triggerId_fkey";

/*
Statement 2
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."activation_pods_trigger_id";

/*
Statement 3
  - DELETES_DATA: Deletes all values in the column
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" DROP COLUMN "triggerId";
