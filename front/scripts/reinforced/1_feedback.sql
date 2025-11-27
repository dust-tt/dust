-- ============================================
-- PARAMETERS - Replace these values before running
-- ============================================
-- WORKSPACE_SID: e.g., '0ec9852c2f'
-- AGENT_SID: e.g., 'hIgZgVo5Gz'

-- ============================================
-- Extract feedback for conversations with a given agent
-- Export result to: runs/[clientName]/feedback.json
-- ============================================

SELECT
    c."sId" AS "conversationSId",
    m."sId" AS "messageSId",
    amf."thumbDirection",
    amf.content AS "feedbackContent",
    amf."createdAt" AS "feedbackCreatedAt",
    u.name AS "userName",
    u.email AS "userEmail"
FROM agent_message_feedbacks amf
INNER JOIN agent_messages am ON amf."agentMessageId" = am.id
INNER JOIN messages m ON m."agentMessageId" = am.id
INNER JOIN conversations c ON m."conversationId" = c.id
INNER JOIN workspaces w ON c."workspaceId" = w.id
LEFT JOIN users u ON amf."userId" = u.id
WHERE w."sId" = 'WORKSPACE_SID'
  AND am."agentConfigurationId" = 'AGENT_SID'
  AND c.visibility = 'unlisted'
ORDER BY c."sId", amf."createdAt" DESC;
