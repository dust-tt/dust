-- Migration created by Cloud Opus on 2025-07-09
-- Add sId column to agent_step_contents table

ALTER TABLE "agent_step_contents" ADD COLUMN "sId" VARCHAR(255);

-- Create unique index on sId
CREATE UNIQUE INDEX "agent_step_contents_s_id_idx" ON "agent_step_contents" ("sId");
