/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_sandbox_env_vars" ADD COLUMN "secret_source_kind" text COLLATE "pg_catalog"."default" DEFAULT 'dust-managed'::text NOT NULL;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_sandbox_env_vars" ADD COLUMN "secret_source_config" jsonb;
