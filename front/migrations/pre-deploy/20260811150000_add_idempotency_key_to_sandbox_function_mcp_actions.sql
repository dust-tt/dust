/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" ADD COLUMN "idempotencyKey" character varying(255) COLLATE "pg_catalog"."default";
