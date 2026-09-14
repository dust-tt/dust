/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_work_areas" DROP CONSTRAINT IF EXISTS "activation_work_areas_userId_fkey";

/*
Statement 1
  - INDEX_DROPPED: Replaced by listing work areas through activation_pods.userId + podId.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY IF EXISTS "public"."activation_work_areas_user_id";

/*
Statement 2
  - INDEX_DROPPED: Replaced by listing work areas through activation_pods.userId + podId.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY IF EXISTS "public"."activation_work_areas_workspace_user_status";

/*
Statement 3
  - DELETES_DATA: Ownership now lives on activation_pods.userId.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_work_areas" DROP COLUMN IF EXISTS "userId";
