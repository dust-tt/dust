-- Migration created on Sep 26, 2024
DROP INDEX IF EXISTS "labs_transcripts_histories_file_id_configuration_id";
CREATE UNIQUE INDEX "labs_transcripts_histories_file_id_configuration_id" ON "labs_transcripts_histories" ("fileId", "configurationId");
DROP INDEX IF EXISTS "labs_transcripts_histories_file_id";
