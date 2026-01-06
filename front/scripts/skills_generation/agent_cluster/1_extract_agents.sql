-- Get all active published agents from a workspace with their instructions and tools
-- Replace the workspace sId in the WHERE clause before running
-- Note: For internal MCP servers, sId is the internalMCPServerId (e.g., "ims_xxx")
-- Tool names for internal MCP servers are resolved in the TypeScript scripts
WITH agent_tools AS (
    SELECT
        ac.id AS agent_config_id,
        COALESCE(
            jsonb_agg(DISTINCT
                jsonb_build_object(
                    'sId', COALESCE(mcp."internalMCPServerId", rms.id::text),
                    'name', COALESCE(mcp.name, msv.name, mcp."internalMCPServerId", rms."cachedName"),
                    'mcpServerViewId', mcp."mcpServerViewId",
                    'isInternal', (mcp."internalMCPServerId" IS NOT NULL),
                    'remoteMcpServerId', rms.id::text
                )
            ) FILTER (WHERE mcp.id IS NOT NULL),
            '[]'::jsonb
        ) AS tools
    FROM agent_configurations ac
    LEFT JOIN agent_mcp_server_configurations mcp ON mcp."agentConfigurationId" = ac.id
    LEFT JOIN mcp_server_views msv ON msv.id = mcp."mcpServerViewId"
    LEFT JOIN remote_mcp_servers rms ON rms.id = msv."remoteMcpServerId"
    WHERE ac.status = 'active'
      AND ac.scope = 'visible'  -- Only published agents
    GROUP BY ac.id
)
SELECT
    w."sId" AS workspace_sid,
    ac."sId" AS agent_id,
    ac.name AS agent_name,
    ac.instructions,
    at.tools
FROM agent_configurations ac
JOIN workspaces w ON w.id = ac."workspaceId"
JOIN agent_tools at ON at.agent_config_id = ac.id
WHERE w."sId" = '6a51fb5d4a'  -- Replace with target workspace sId
    AND ac.status = 'active'
    AND ac.scope = 'visible'  -- Only published agents
    AND ac.instructions IS NOT NULL
    AND ac.instructions != ''
ORDER BY ac.name;