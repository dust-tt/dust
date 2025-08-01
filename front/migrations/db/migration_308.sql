-- Migration created on Jul 9, 2025
ALTER TABLE "public"."agent_data_source_configurations" DROP COLUMN "retrievalConfigurationId";
DROP TABLE IF EXISTS "public"."agent_retrieval_configurations";
