import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { buildJITServerConfiguration } from "@app/lib/api/assistant/jit/utils";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Get the files MCP server for conversation file system access.
 */
export function getFilesServer(
  agentConfiguration: AgentLoopExecutionData["agentConfiguration"],
  conversation: ConversationWithoutContentType,
  autoInternalViews: Map<AutoInternalMCPServerNameType, MCPServerViewResource>
): ServerSideMCPServerConfigurationType | null {
  if (conversation.metadata?.useFileSystem !== true) {
    return null;
  }

  const filesView = autoInternalViews.get("files") ?? null;

  if (!filesView) {
    logger.warn(
      {
        agentConfigurationId: agentConfiguration.sId,
        conversationId: conversation.sId,
      },
      "MCP server view not found for files. Ensure auto tools are created."
    );
    return null;
  }

  return buildJITServerConfiguration(filesView, {
    name: "files",
    description: "File system interface scoped to the current conversation.",
  });
}
