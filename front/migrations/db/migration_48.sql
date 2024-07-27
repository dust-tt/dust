-- Migration created on Jul 27, 2024
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vaults';
CREATE TABLE IF NOT EXISTS "vaults" ("id"  SERIAL , "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "name" VARCHAR(255) NOT NULL, "kind" VARCHAR(255) NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "groupId" INTEGER NOT NULL REFERENCES "groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY ("id"));
SELECT i.relname AS name, ix.indisprimary AS primary, ix.indisunique AS unique, ix.indkey AS indkey, array_agg(a.attnum) as column_indexes, array_agg(a.attname) AS column_names, pg_get_indexdef(ix.indexrelid) AS definition FROM pg_class t, pg_class i, pg_index ix, pg_attribute a WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND a.attrelid = t.oid AND t.relkind = 'r' and t.relname = 'vaults' GROUP BY i.relname, ix.indexrelid, ix.indisprimary, ix.indisunique, ix.indkey ORDER BY i.relname;
CREATE UNIQUE INDEX "vaults_workspace_id_name" ON "vaults" ("workspaceId", "name");
CREATE INDEX "vaults_workspace_id_kind" ON "vaults" ("workspaceId", "kind");
ALTER TABLE "public"."data_sources" ADD COLUMN "vaultId" INTEGER REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "data_sources_workspace_id_vault_id" ON "data_sources" ("workspaceId", "vaultId");
