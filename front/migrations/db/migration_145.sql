-- Migration created on Jan 21, 2025
ALTER TABLE "public"."agent_dust_app_run_actions"
  ADD COLUMN "resultsFileId" integer REFERENCES "public"."files" ("id") ON DELETE SET NULL,
  ADD COLUMN "resultsFileSnippet" text;

-- Add index for resultsFileId
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_dust_app_run_actions_results_file_id" ON "public"."agent_dust_app_run_actions" ("resultsFileId");
