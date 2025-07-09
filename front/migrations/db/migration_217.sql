-- Migration created on Apr 16, 2025
ALTER TABLE "public"."agent_process_configurations" ADD COLUMN "jsonSchema" JSONB;
ALTER TABLE "agent_process_configurations" ALTER COLUMN "schema" DROP NOT NULL;ALTER TABLE "agent_process_configurations" ALTER COLUMN "schema" DROP DEFAULT;ALTER TABLE "agent_process_configurations" ALTER COLUMN "schema" TYPE JSONB;
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "jsonSchema" JSONB;
ALTER TABLE "agent_process_actions" ALTER COLUMN "schema" DROP NOT NULL;ALTER TABLE "agent_process_actions" ALTER COLUMN "schema" SET DEFAULT NULL;ALTER TABLE "agent_process_actions" ALTER COLUMN "schema" TYPE JSONB;
