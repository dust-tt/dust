-- ============================================
-- PARAMETERS - Replace these values before running
-- ============================================
-- WORKSPACE_SID: e.g., '0ec9852c2f'
-- AGENT_SID: e.g., 'hIgZgVo5Gz'

-- ============================================
-- Extract the prompt (instructions) of an agent
-- Export result to: runs/[clientName]/prompt.json
-- ============================================

SELECT
    ac."sId" AS "agentSId",
    ac.name AS "agentName",
    ac.description AS "agentDescription",
    ac.instructions,
    ac."modelId",
    ac."providerId",
    ac.version
FROM agent_configurations ac
INNER JOIN workspaces w ON ac."workspaceId" = w.id
WHERE w."sId" = 'WORKSPACE_SID'
  AND ac."sId" = 'AGENT_SID'
  AND ac.status = 'active'
ORDER BY ac.version DESC
LIMIT 1;
