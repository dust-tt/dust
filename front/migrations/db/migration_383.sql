-- Migration created on Oct 17, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "requestedSpaceIds" BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[];
ALTER TABLE "public"."agent_configurations" ADD COLUMN "requestedSpaceIds" BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[];
