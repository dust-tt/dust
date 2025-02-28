-- Migration created on Feb 28, 2025
ALTER TABLE "public"."agent_tables_query_actions" ADD COLUMN "richTextFileId" BIGINT REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX CONCURRENTLY "agent_tables_query_actions_rich_text_file_id" ON "agent_tables_query_actions" ("richTextFileId");
