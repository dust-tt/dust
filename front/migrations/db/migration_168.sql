-- Migration created on Feb 03, 2025
ALTER TABLE "public"."agent_retrieval_actions" ADD COLUMN "tagsIn" VARCHAR(255)[];
ALTER TABLE "public"."agent_retrieval_actions" ADD COLUMN "tagsNot" VARCHAR(255)[];
