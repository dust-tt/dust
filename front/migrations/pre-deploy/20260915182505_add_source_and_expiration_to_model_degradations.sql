/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."model_degradations" ADD COLUMN "expiresAt" timestamp with time zone;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."model_degradations" ADD COLUMN "source" character varying(255) COLLATE "pg_catalog"."default" DEFAULT 'manual'::character varying NOT NULL;

/*
Statement 2
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY model_degradations_model_id_provider_id_host_source ON public.model_degradations USING btree ("modelId", "providerId", host, source);

/*
Statement 3
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."model_degradations_model_id_provider_id_host";
