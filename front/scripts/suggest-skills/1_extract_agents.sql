-- Extract all active published agents with their instructions
-- Replace the workspace sId in the WHERE clause before running
-- Export as JSON from Metabase
SELECT
    w."sId" AS workspace_sid,
    ac."sId" AS agent_id,
    ac.name AS agent_name,
    ac.instructions
FROM agent_configurations ac
JOIN workspaces w ON w.id = ac."workspaceId"
WHERE w."sId" = 'WORKSPACE_SID_HERE'  -- Replace with target workspace sId
    AND ac.status = 'active'
    AND ac.scope = 'visible'
    AND ac.instructions IS NOT NULL
    AND ac.instructions != ''
    AND LENGTH(ac.instructions) > 100;  -- Filter out very short instructions
