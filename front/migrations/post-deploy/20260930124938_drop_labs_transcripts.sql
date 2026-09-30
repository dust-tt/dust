-- Labs transcripts are removed. Histories reference configurations, so drop them first.
SET lock_timeout = '5s';

DROP TABLE "public"."labs_transcripts_histories";
DROP TABLE "public"."labs_transcripts_configurations";
