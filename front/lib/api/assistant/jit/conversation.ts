import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { CONVERSATION_FILES_SERVER_NAME } from "@app/lib/api/actions/servers/conversation_files/metadata";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import assert from "assert";

/**
 * Get MCP server configurations for conversation-specific tools.
 * These are tools explicitly attached to the conversation.
 */
export async function getConversationMCPServers(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType[]> {
  const conversationMCPServerViews =
    await ConversationResource.fetchMCPServerViews(auth, conversation, {
      onlyEnabled: true,
    });

  // Batch-fetch all MCP server views.
  const mcpServerViewIds = conversationMCPServerViews.map(
    (v) => v.mcpServerViewId
  );
  const mcpServerViews = await MCPServerViewResource.fetchByModelIds(
    auth,
    mcpServerViewIds
  );

  return mcpServerViews.map((mcpServerViewResource) => {
    const mcpServerView = mcpServerViewResource.toJSON();

    return {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_server_configuration",
      name: mcpServerView.name ?? mcpServerView.server.name,
      description:
        mcpServerView.description ?? mcpServerView.server.description,
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      secretName: null,
      dustProject: null,
      additionalConfiguration: {},
      mcpServerViewId: mcpServerView.sId,
      dustAppConfiguration: null,
      internalMCPServerId:
        mcpServerView.serverType === "internal"
          ? mcpServerView.server.sId
          : null,
    };
  });
}

/**
 * Get the conversation_files MCP server for accessing conversation files.
 * Only created if conversation has attachments.
 */
export async function getConversationFilesServer(
  auth: Authenticator,
  attachments: ConversationAttachmentType[]
): Promise<ServerSideMCPServerConfigurationType | null> {
  if (attachments.length === 0) {
    return null;
  }

  const conversationFilesView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "conversation_files"
    );

  assert(
    conversationFilesView,
    "MCP server view not found for conversation_files. Ensure auto tools are created."
  );

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: CONVERSATION_FILES_SERVER_NAME,
    description: "Access and include files from the conversation",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: conversationFilesView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: conversationFilesView.mcpServerId,
  };
}
