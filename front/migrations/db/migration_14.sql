-- Migration created on Jun 05, 2024
ALTER TABLE
    "public"."agent_retrieval_configurations" DROP COLUMN "forceUseAtIteration";

ALTER TABLE
    "public"."agent_dust_app_run_configurations" DROP COLUMN "forceUseAtIteration";

ALTER TABLE
    "public"."agent_tables_query_configurations" DROP COLUMN "forceUseAtIteration";

ALTER TABLE
    "public"."agent_process_configurations" DROP COLUMN "forceUseAtIteration";

ALTER TABLE
    "public"."agent_websearch_configurations" DROP COLUMN "forceUseAtIteration";