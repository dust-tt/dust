/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" ADD CONSTRAINT "sandbox_function_invocations_gcs_path_not_null" CHECK("gcsPath" IS NOT NULL) NOT VALID;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" VALIDATE CONSTRAINT "sandbox_function_invocations_gcs_path_not_null";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" ALTER COLUMN "gcsPath" SET NOT NULL;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" DROP CONSTRAINT "sandbox_function_invocations_gcs_path_not_null";
