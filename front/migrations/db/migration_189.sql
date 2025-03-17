<<<<<<< HEAD
-- Migration created on Mar 12, 2025
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "useConnectorConnection" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."labs_transcripts_configurations"
SET "useConnectorConnection" = true 
WHERE "provider" = 'gong';

UPDATE "public"."labs_transcripts_configurations" 
SET "isDefaultWorkspaceConfiguration" = true 
WHERE "isDefaultFullStorage" = true;
=======
DROP TABLE agent_github_configurations;

DROP TABLE agent_github_create_issue_actions;

DROP TABLE agent_github_get_pull_request_actions;

DROP TABLE platform_actions_configurations;
>>>>>>> main
