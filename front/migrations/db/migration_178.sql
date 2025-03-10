ALTER TABLE "public"."agent_tables_query_actions" ADD COLUMN "sectionFileId" BIGINT REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX CONCURRENTLY "agent_tables_query_actions_section_file_id" ON "agent_tables_query_actions" ("sectionFileId");
