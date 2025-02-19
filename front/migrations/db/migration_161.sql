-- Migration created on Jan 27, 2025
ALTER TABLE "public"."agent_github_get_pull_request_actions" ADD COLUMN "pullComments" JSONB[];
ALTER TABLE "public"."agent_github_get_pull_request_actions" ADD COLUMN "pullReviews" JSONB[];
