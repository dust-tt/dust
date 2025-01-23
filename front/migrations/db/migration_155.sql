-- Migration created on Jan 23, 2025
ALTER TABLE "public"."agent_github_configurations" ADD COLUMN "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."agent_github_get_pull_request_actions" ADD COLUMN "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create new column (w/o NOT NULL)
ALTER TABLE "public"."labs_transcripts_histories" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from labs_transcripts
UPDATE "public"."labs_transcripts_histories" h
SET "workspaceId" = c."workspaceId"
FROM "labs_transcripts_configurations" c
WHERE h."configurationId" = c.id;

-- Set NOT NULL
ALTER TABLE "public"."labs_transcripts_histories" ALTER COLUMN "workspaceId" SET NOT NULL;
