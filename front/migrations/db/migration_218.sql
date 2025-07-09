-- Migration created on Apr 20, 2025
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "jsonFileSnippet" TEXT;
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "jsonFileId" BIGINT REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX CONCURRENTLY "agent_process_actions_json_file_id" ON "agent_process_actions" ("jsonFileId");
