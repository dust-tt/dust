-- Migration created on Dec 05, 2024
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "credentialId" VARCHAR(255);
ALTER TABLE "labs_transcripts_configurations" ALTER COLUMN "connectionId" DROP NOT NULL;
ALTER TABLE "labs_transcripts_configurations" ALTER COLUMN "connectionId" DROP DEFAULT;
