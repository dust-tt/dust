import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
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

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: documentsView.name ?? "documents",
    description:
      documentsView.description ??
      "Collaborate on Markdown documents in the file system.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: documentsView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: documentsView.mcpServerId,
  };
}
