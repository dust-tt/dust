import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { ConversationMetadata } from "@app/types/assistant/conversation";

// TODO(copilot 2026-01-23): move all copilot mcp servers and these helpers in dedicated folder
export interface CopilotMetadata {
  copilotTargetAgentConfigurationId: string;
  copilotTargetAgentConfigurationVersion: number;
}

function extractCopilotMetadata(
  metadata: ConversationMetadata
): CopilotMetadata | null {
  const id = metadata.copilotTargetAgentConfigurationId;
  const version = metadata.copilotTargetAgentConfigurationVersion;

  if (typeof id === "string" && typeof version === "number") {
    return {
      copilotTargetAgentConfigurationId: id,
      copilotTargetAgentConfigurationVersion: version,
    };
  }
  return null;
}

export function isCopilotConversation(metadata: ConversationMetadata): boolean {
  return extractCopilotMetadata(metadata) !== null;
}

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
): CopilotMetadata | null {
  const metadata =
    agentLoopContext?.runContext?.conversation.metadata ??
    agentLoopContext?.listToolsContext?.conversation.metadata;

  return metadata ? extractCopilotMetadata(metadata) : null;
}
