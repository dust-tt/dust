-- Migration created on May 04, 2026
-- Butler / agent todo suggestion review (approve or reject from UI)
ALTER TABLE "project_todos"
ADD COLUMN IF NOT EXISTS "agentSuggestionStatus" VARCHAR NULL,
ADD COLUMN IF NOT EXISTS "agentSuggestionReviewedAt" TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS "agentSuggestionReviewedByUserId" BIGINT NULL;

ALTER TABLE "project_todo_versions"
ADD COLUMN IF NOT EXISTS "agentSuggestionStatus" VARCHAR NULL,
ADD COLUMN IF NOT EXISTS "agentSuggestionReviewedAt" TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS "agentSuggestionReviewedByUserId" BIGINT NULL;
