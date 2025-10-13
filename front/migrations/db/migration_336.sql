-- Migration created on Aug 18, 2025
UPDATE "agent_configurations"
SET "maxStepsPerRun" = 64
WHERE status = 'active';
