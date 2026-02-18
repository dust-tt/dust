SELECT json_agg(t)
FROM (
    WITH agent_tools AS (
    -- Get MCP tools by joining through mcp_server_views
    SELECT
        amsc."agentConfigurationId",
        amsc."sId" AS agent_mcp_config_sid,  -- This is AgentMCPServerConfiguration.sId
        msv.id AS mcp_server_view_id,        -- ⭐ THIS IS WHAT YOU NEED! ⭐
        msv."serverType" AS tool_type,
        msv."internalMCPServerId",
        msv."remoteMCPServerId",
        COALESCE(amsc.name, msv.name, rms."cachedName", amsc."internalMCPServerId") AS tool_name,
        COALESCE(amsc."singleToolDescriptionOverride", msv.description, rms."cachedDescription") AS tool_description
    FROM agent_mcp_server_configurations amsc
    JOIN mcp_server_views msv
        ON msv.id = amsc."mcpServerViewId"
    LEFT JOIN remote_mcp_servers rms
        ON rms.id = msv."remoteMCPServerId"
    WHERE amsc."agentConfigurationId" IN (
        SELECT ac.id
        FROM agent_configurations ac
        JOIN workspaces w ON w.id = ac."workspaceId"
        WHERE ac.status = 'active'
          AND w."sId" = '<YOUR_WORKSPACE_SID>'
          AND ac.scope = 'visible'
    )
),
    agent_datasources AS (
    -- Get datasources attached to agents through agent_data_source_configurations
    SELECT
        amsc."agentConfigurationId",
        ds."dustAPIDataSourceId" AS datasource_id,
        ds.name AS datasource_name,
        ds.description AS datasource_description,
        ds."connectorProvider",
        dsv.id AS data_source_view_id,
        adsc."parentsIn",
        adsc."tagsIn",
        adsc."tagsNotIn",
        adsc."tagsMode"
    FROM agent_data_source_configurations adsc
    JOIN agent_mcp_server_configurations amsc
        ON amsc.id = adsc."mcpServerConfigurationId"
    JOIN data_sources ds
        ON ds.id = adsc."dataSourceId"
    LEFT JOIN data_source_views dsv
        ON dsv.id = adsc."dataSourceViewId"
    WHERE amsc."agentConfigurationId" IN (
        SELECT ac.id
        FROM agent_configurations ac
        JOIN workspaces w ON w.id = ac."workspaceId"
        WHERE ac.status = 'active'
          AND w."sId" = '<YOUR_WORKSPACE_SID>'
          AND ac.scope = 'visible'
    )
)
SELECT
    ac."sId" AS agent_sid,
    ac.name AS agent_name,
    ac.description,
    ac.instructions,
    COUNT(DISTINCT am.id) AS total_messages,
    MIN(am."createdAt") AS first_usage,
    MAX(am."createdAt") AS last_usage,
    -- Aggregate tools
    json_agg(DISTINCT jsonb_build_object(
        'mcp_server_view_id', at.mcp_server_view_id,  -- ⭐ Use this in your JSON! ⭐
        'tool_type', at.tool_type,
        'tool_name', at.tool_name,
        'tool_description', at.tool_description,
        'internal_mcp_server_id', at."internalMCPServerId",
        'remote_mcp_server_id', at."remoteMCPServerId"
    )) FILTER (WHERE at.mcp_server_view_id IS NOT NULL) AS tools,
    -- Aggregate datasources
    json_agg(DISTINCT jsonb_build_object(
        'datasource_id', ads.datasource_id,
        'datasource_name', ads.datasource_name,
        'datasource_description', ads.datasource_description,
        'connector_provider', ads."connectorProvider",
        'data_source_view_id', ads.data_source_view_id,
        'parents_in', ads."parentsIn",
        'tags_in', ads."tagsIn",
        'tags_not_in', ads."tagsNotIn",
        'tags_mode', ads."tagsMode"
    )) FILTER (WHERE ads.datasource_id IS NOT NULL) AS datasources
FROM agent_configurations ac
JOIN workspaces w ON w.id = ac."workspaceId"
LEFT JOIN agent_messages am
    ON am."agentConfigurationId" = ac."sId"
    AND am."createdAt" >= NOW() - INTERVAL '30 days'
LEFT JOIN agent_tools at
    ON at."agentConfigurationId" = ac.id
LEFT JOIN agent_datasources ads
    ON ads."agentConfigurationId" = ac.id
WHERE ac.status = 'active'
  AND w."sId" = '<YOUR_WORKSPACE_SID>'
  AND ac.scope = 'visible'
GROUP BY
    ac."sId",
    ac.name,
    ac.description,
    ac.instructions,
    ac.id
ORDER BY total_messages DESC
LIMIT 60) t;