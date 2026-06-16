/*
Statement 0
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."dust_project_conversations_conversation_id";
