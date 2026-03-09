import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { ConversationMetadata } from "@app/types/assistant/conversation";

// TODO(sidekick 2026-01-23): move all sidekick mcp servers and these helpers in dedicated folder
export interface SidekickMetadata {
  sidekickTargetAgentConfigurationId: string;
  sidekickTargetAgentConfigurationVersion: number;
}

function extractSidekickMetadata(
  metadata: ConversationMetadata
): SidekickMetadata | null {
  const id = metadata.sidekickTargetAgentConfigurationId;
  const version = metadata.sidekickTargetAgentConfigurationVersion;

  if (typeof id === "string" && typeof version === "number") {
    return {
      sidekickTargetAgentConfigurationId: id,
      sidekickTargetAgentConfigurationVersion: version,
    };
  }
  return null;
}

export function isSidekickConversation(
  metadata: ConversationMetadata
): boolean {
  return extractSidekickMetadata(metadata) !== null;
}

/**
 * Extracts the sidekick metadata from the agent loop context.
 *
 * AgentLoopContextType is a discriminated union with two variants:
 * - `runContext`: Present when executing a tool (the agent is running and calling tools)
 * - `listToolsContext`: Present when listing available tools (before tool execution, used for dynamic tool filtering)
 *
 * Both variants contain the conversation, so we check both to access conversation metadata.
 */
export function getSidekickMetadataFromContext(
  agentLoopContext?: AgentLoopContextType
): SidekickMetadata | null {
  const metadata =
    agentLoopContext?.runContext?.conversation.metadata ??
    agentLoopContext?.listToolsContext?.conversation.metadata;

  return metadata ? extractSidekickMetadata(metadata) : null;
}
