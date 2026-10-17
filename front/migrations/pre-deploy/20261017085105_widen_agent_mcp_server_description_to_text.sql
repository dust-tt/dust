SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_mcp_server_configurations" ALTER COLUMN "singleToolDescriptionOverride" SET DATA TYPE text COLLATE "pg_catalog"."default" using "singleToolDescriptionOverride"::text;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ANALYZE "public"."agent_mcp_server_configurations" ("singleToolDescriptionOverride");
