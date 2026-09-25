-- Generated with migration:generate:pre-deploy; scoped to the agent_suggestions model (the local
-- database had drifted, so unrelated statements were dropped).

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggestions" ADD COLUMN "title" character varying(255) COLLATE "pg_catalog"."default";
