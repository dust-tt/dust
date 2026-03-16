-- Migration created on Mar 12, 2026
ALTER TABLE "public"."agent_configurations" ADD COLUMN "reinforcement" VARCHAR(255) NOT NULL DEFAULT 'auto';
