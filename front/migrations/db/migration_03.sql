-- Migration created on May 16, 2024
ALTER TABLE "public"."agent_retrieval_actions" ADD COLUMN "functionCallName" VARCHAR(255);
ALTER TABLE "public"."agent_tables_query_actions" ADD COLUMN "functionCallName" VARCHAR(255);
ALTER TABLE "public"."agent_dust_app_run_actions" ADD COLUMN "functionCallName" VARCHAR(255);
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "functionCallName" VARCHAR(255);
