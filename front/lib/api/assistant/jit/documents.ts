import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { buildJITServerConfiguration } from "@app/lib/api/assistant/jit/utils";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Get the documents MCP server for commenting on Markdown documents. Its view only exists in
 * workspaces with `co_edition`, so a missing view is expected and not logged.
 */
export function getDocumentsServer(
  conversation: ConversationWithoutContentType,
  autoInternalViews: Map<AutoInternalMCPServerNameType, MCPServerViewResource>
): ServerSideMCPServerConfigurationType | null {
  if (conversation.metadata?.useFileSystem !== true) {
    return null;
  }

  const documentsView = autoInternalViews.get("documents") ?? null;
  if (!documentsView) {
    return null;
  }

  return buildJITServerConfiguration(documentsView, {
    name: "documents",
    description: "Collaborate on Markdown documents in the file system.",
  });
}
