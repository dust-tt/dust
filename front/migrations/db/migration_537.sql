-- Script to run after deployment of copilot->sidekick rename
UPDATE templates SET sidekickInstructions = copilotInstructions;
ALTER TABLE "templates" DROP COLUMN "copilotInstructions";

COMMENT ON COLUMN "agent_suggestions"."source" IS 'Origin of the suggestion such as reinforcement or sidekick';
UPDATE agent_suggestions SET source='sidekick' WHERE source='copilot';

UPDATE user_messages SET userContextOrigin='agent_sidekick' WHERE userContextOrigin='agent_copilot';
