/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" RENAME COLUMN "podId" TO "spaceId";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER INDEX "public"."sandbox_functions_pod_id" RENAME TO "sandbox_functions_space_id";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER INDEX "public"."sandbox_functions_workspace_id_pod_id_file_id" RENAME TO "sandbox_functions_workspace_id_space_id_file_id";

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" RENAME CONSTRAINT "sandbox_functions_podId_fkey" TO "sandbox_functions_spaceId_fkey";
