-- Migration created on Jan 30, 2025
ALTER TABLE "public"."agent_data_source_configurations" ADD COLUMN "tagsQuery" VARCHAR(255);
ALTER TABLE "public"."agent_data_source_configurations" ADD COLUMN "tagsIn" VARCHAR(255)[];
ALTER TABLE "public"."agent_data_source_configurations" ADD COLUMN "tagsNotIn" VARCHAR(255)[];
