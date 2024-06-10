-- Migration created on Jun 07, 2024
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'run_usages';
CREATE TABLE IF NOT EXISTS "run_usages" ("id"  SERIAL , "providerId" VARCHAR(255) NOT NULL, "modelId" VARCHAR(255) NOT NULL, "promptTokens" INTEGER NOT NULL, "completionTokens" INTEGER NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "runId" INTEGER NOT NULL REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("id"));
SELECT i.relname AS name, ix.indisprimary AS primary, ix.indisunique AS unique, ix.indkey AS indkey, array_agg(a.attnum) as column_indexes, array_agg(a.attname) AS column_names, pg_get_indexdef(ix.indexrelid) AS definition FROM pg_class t, pg_class i, pg_index ix, pg_attribute a WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND a.attrelid = t.oid AND t.relkind = 'r' and t.relname = 'run_usages' GROUP BY i.relname, ix.indexrelid, ix.indisprimary, ix.indisunique, ix.indkey ORDER BY i.relname;
CREATE INDEX "run_usages_run_id" ON "run_usages" ("runId");
CREATE INDEX "run_usages_provider_id_model_id" ON "run_usages" ("providerId", "modelId");
