/*
Generic per-message retrieval-scope hint: data source tags to exclude from retrieval for the run,
stored as opaque "key:value" strings. Downstream code does not interpret their meaning; the Slack
bot uses it to set "threadId:<ts>" so a run does not self-match on the very thread that triggered it.
*/

/* Nullable, default NULL: old code ignores the column, new code treats NULL as "no exclusions". */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."user_messages"
  ADD COLUMN "userContextExcludedRetrievalTags" character varying(255)[] DEFAULT NULL;
