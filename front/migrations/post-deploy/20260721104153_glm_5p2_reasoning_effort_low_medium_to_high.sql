/*
GLM-5.2 no longer supports the low/medium reasoning efforts; move existing
agent configurations onto the only supported non-none tier: high.
*/
SET SESSION statement_timeout = 60000;
SET SESSION lock_timeout = 3000;
UPDATE
    agent_configurations
SET
    "reasoningEffort" = 'high'
WHERE
    "modelId" = 'accounts/fireworks/models/glm-5p2'
    AND "reasoningEffort" IN ('low', 'medium');
