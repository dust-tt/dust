-- Migration created on May 19, 2026

DROP INDEX CONCURRENTLY IF EXISTS "agent_message_feedbacks_workspace_id_conversation_id";
DROP INDEX CONCURRENTLY IF EXISTS "agent_mcp_action_output_items_workspace_id_agent_mcp_action_id";
DROP INDEX CONCURRENTLY IF EXISTS "agent_sc_te_workspace_action";
DROP INDEX CONCURRENTLY IF EXISTS "agent_sc_te_workspace_step_content";
DROP INDEX CONCURRENTLY IF EXISTS "agent_suggestions_workspace_id_conversation_id";
DROP INDEX CONCURRENTLY IF EXISTS "conversation_participants_workspace_id_conversation_id";
DROP INDEX CONCURRENTLY IF EXISTS "user_conversation_reads_workspace_id_conversation_id";
DROP INDEX CONCURRENTLY IF EXISTS "wake_ups_workspace_id_conversation_id_status_idx";
