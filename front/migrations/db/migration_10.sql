-- Migration created on May 23, 2024
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "defaultForWorkspace" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "labs_transcripts_configurations" ALTER COLUMN "connectionId" DROP NOT NULL;ALTER TABLE "labs_transcripts_configurations" ALTER COLUMN "connectionId" DROP DEFAULT;ALTER TABLE "labs_transcripts_configurations" ALTER COLUMN "connectionId" TYPE VARCHAR(255);
CREATE UNIQUE INDEX "labs_transcripts_configurations_workspace_id_default_for_workspace" ON "labs_transcripts_configurations" ("workspaceId", "defaultForWorkspace");
