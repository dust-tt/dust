-- ============================================
-- PARAMETERS - Replace these values before running
-- ============================================
-- WORKSPACE_SID: e.g., '0ec9852c2f'
-- AGENT_SID: e.g., 'hIgZgVo5Gz'
-- CONVERSATION_LIMIT: e.g., 100

-- ============================================
-- Extract all conversations with their messages, tool calls and results
-- for a given agent in a given workspace
-- Export result to: runs/[clientName]/conversations.json
-- ============================================

WITH conversation_ids AS (
    SELECT DISTINCT c.id, c."sId", c."createdAt" AS "conversationCreatedAt"
    FROM conversations c
    INNER JOIN workspaces w ON c."workspaceId" = w.id
    INNER JOIN messages m ON m."conversationId" = c.id
    INNER JOIN mentions mn ON mn."messageId" = m.id
    WHERE w."sId" = 'WORKSPACE_SID'
      AND mn."agentConfigurationId" = 'AGENT_SID'
      AND c.visibility = 'unlisted'
    ORDER BY c."createdAt" DESC
    LIMIT CONVERSATION_LIMIT
)
SELECT
    ci."sId" AS "conversationSId",
    m."sId" AS "messageSId",
    m.rank,
    m.version,
    m."createdAt",
    CASE
        WHEN m."userMessageId" IS NOT NULL THEN 'user'
        WHEN m."agentMessageId" IS NOT NULL THEN 'agent'
        WHEN m."contentFragmentId" IS NOT NULL THEN 'content_fragment'
    END AS "messageType",
    -- User message content
    um.content AS "userMessageContent",
    um."userContextUsername",
    um."userContextFullName",
    -- Agent message info
    am.status AS "agentMessageStatus",
    am."agentConfigurationId",
    am."errorCode",
    am."errorMessage",
    -- Step contents (tool calls and text) as JSON array
    (
        SELECT json_agg(
            json_build_object(
                'step', asc2.step,
                'index', asc2.index,
                'type', asc2.type,
                'value', asc2.value
            ) ORDER BY asc2.step, asc2.index
        )
        FROM agent_step_contents asc2
        WHERE asc2."agentMessageId" = am.id
    ) AS "stepContents"
FROM conversation_ids ci
INNER JOIN messages m ON m."conversationId" = ci.id
LEFT JOIN user_messages um ON m."userMessageId" = um.id
LEFT JOIN agent_messages am ON m."agentMessageId" = am.id
ORDER BY ci."conversationCreatedAt" DESC, ci."sId", m.rank, m.version;
