-- Migration created on Feb 12, 2025
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "tagsIn" VARCHAR(255)[];
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "tagsNot" VARCHAR(255)[];

