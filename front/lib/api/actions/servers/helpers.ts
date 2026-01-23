import type { AgentLoopContextType } from "@app/lib/actions/types";

// TODO(copilot 2026-01-23): move all copilot mcp servers and this helper in the same folder
/**
 * Extracts the copilot metadata from the agent loop context.
 *
 * AgentLoopContextType is a discriminated union with two variants:
 * - `runContext`: Present when executing a tool (the agent is running and calling tools)
 * - `listToolsContext`: Present when listing available tools (before tool execution, used for dynamic tool filtering)
 *
 * Both variants contain the conversation, so we check both to access conversation metadata.
 */
export function getCopilotMetadataFromContext(
  agentLoopContext?: AgentLoopContextType
) {
  return (
    agentLoopContext?.runContext?.conversation.metadata.agentCopilot ??
    agentLoopContext?.listToolsContext?.conversation.metadata.agentCopilot ??
    null
  );
}
