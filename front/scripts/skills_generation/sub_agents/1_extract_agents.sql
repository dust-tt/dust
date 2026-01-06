-- Get all agents used as sub-agents via the "Run Agent" tool
-- Note: Tool names for internal MCP servers show the sId since names are defined in code, not DB
WITH child_agents AS (
    SELECT
        cac."agentConfigurationId" AS child_agent_sid,
        cac."workspaceId",
        mcp."agentConfigurationId" AS parent_agent_config_id
    FROM agent_child_agent_configurations cac
    JOIN agent_mcp_server_configurations mcp ON mcp.id = cac."mcpServerConfigurationId"
    JOIN workspaces w ON w.id = cac."workspaceId"
    WHERE w."sId" = '0ec9852c2f'
),
child_agent_details AS (
    SELECT DISTINCT
        ca.child_agent_sid,
        ca."workspaceId",
        w."sId" AS workspace_sid,
        ac."sId" AS child_sid,
        ac.name AS child_name,
        ac.instructions AS child_instructions,
        ac.id AS child_config_id
    FROM child_agents ca
    JOIN agent_configurations ac ON ac."sId" = ca.child_agent_sid
        AND ac."workspaceId" = ca."workspaceId"
        AND ac.status = 'active'
    JOIN workspaces w ON w.id = ca."workspaceId"
),
child_agent_tools AS (
    SELECT
        cad.child_sid,
        cad."workspaceId",
        COALESCE(
            jsonb_agg(DISTINCT 
                COALESCE(mcp.name, msv.name, mcp."internalMCPServerId")
            ) FILTER (WHERE mcp.id IS NOT NULL),
            '[]'::jsonb
        ) AS tools
    FROM child_agent_details cad
    LEFT JOIN agent_mcp_server_configurations mcp ON mcp."agentConfigurationId" = cad.child_config_id
    LEFT JOIN mcp_server_views msv ON msv.id = mcp."mcpServerViewId"
    GROUP BY cad.child_sid, cad."workspaceId"
),
parent_agents AS (
    SELECT
        ca.child_agent_sid,
        ca."workspaceId",
        jsonb_agg(DISTINCT jsonb_build_object(
            'sId', pac."sId",
            'name', pac.name,
            'instructions', pac.instructions
        )) AS used_by_agents,
        COUNT(DISTINCT pac.id) AS parent_count
    FROM child_agents ca
    JOIN agent_configurations pac ON pac.id = ca.parent_agent_config_id
        AND pac.status = 'active'
    GROUP BY ca.child_agent_sid, ca."workspaceId"
)
SELECT
    cad.workspace_sid,
    cad.child_sid AS agent_id,
    cad.child_name AS agent_name,
    cad.child_instructions AS instructions,
    cat.tools,
    pa.used_by_agents AS agents_using_it
FROM child_agent_details cad
JOIN child_agent_tools cat ON cat.child_sid = cad.child_sid AND cat."workspaceId" = cad."workspaceId"
JOIN parent_agents pa ON pa.child_agent_sid = cad.child_sid AND pa."workspaceId" = cad."workspaceId"
ORDER BY pa.parent_count DESC, cad.child_name;