-- Migration created on Jun 20, 2024
ALTER TABLE "public"."agent_messages" ADD COLUMN "runIds" VARCHAR(255)[];
ALTER TABLE "public"."agent_retrieval_actions" ADD COLUMN "runId" VARCHAR(255);
ALTER TABLE "public"."agent_tables_query_actions" ADD COLUMN "runId" VARCHAR(255);
ALTER TABLE "public"."agent_dust_app_run_actions" ADD COLUMN "runId" VARCHAR(255);
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "runId" VARCHAR(255);
ALTER TABLE "public"."agent_websearch_actions" ADD COLUMN "runId" VARCHAR(255);
ALTER TABLE "public"."agent_browse_actions" ADD COLUMN "runId" VARCHAR(255);
