import { DEFAULT_CONVERSATION_SEARCH_ACTION_NAME } from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type {
  ContentNodeAttachmentType,
  ConversationAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  getConversationDataSourceViews,
  getProjectContextDataSourceView,
} from "@app/lib/api/assistant/jit/utils";
import { PROJECT_CONTEXT_FOLDER_ID } from "@app/lib/api/projects/constants";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import {
  type ConversationWithoutContentType,
  isProjectConversation,
} from "@app/types/assistant/conversation";
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
    name: "conversation_files",
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

/**
 * Get the conversation_search MCP server for semantic search over conversation files.
 * Only created if conversation has searchable attachments.
 */
export async function getConversationSearchServer(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  attachments: ConversationAttachmentType[]
): Promise<ServerSideMCPServerConfigurationType | null> {
  const filesUsableAsRetrievalQuery = attachments.filter((f) => f.isSearchable);

  if (filesUsableAsRetrievalQuery.length === 0) {
    return null;
  }

  const retrievalView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "search"
    );

  assert(
    retrievalView,
    "MCP server view not found for search. Ensure auto tools are created."
  );

  // Get datasource views for child conversations.
  const fileIdToDataSourceViewMap = await getConversationDataSourceViews(
    auth,
    conversation,
    attachments
  );

  const contentNodeAttachments: ContentNodeAttachmentType[] = [];
  for (const f of filesUsableAsRetrievalQuery) {
    if (isContentNodeAttachmentType(f)) {
      contentNodeAttachments.push(f);
    }
  }

  const dataSources: DataSourceConfiguration[] = contentNodeAttachments.map(
    (f) => ({
      workspaceId: auth.getNonNullableWorkspace().sId,
      dataSourceViewId: f.nodeDataSourceViewId,
      filter: {
        parents: {
          in: [f.nodeId],
          not: [],
        },
        tags: null,
      },
    })
  );

  const dataSourceIds = new Set(
    [...fileIdToDataSourceViewMap.values()].map(
      (dataSourceView) => dataSourceView.sId
    )
  );

  for (const dataSourceViewId of dataSourceIds.values()) {
    dataSources.push({
      workspaceId: auth.getNonNullableWorkspace().sId,
      dataSourceViewId,
      filter: { parents: null, tags: null },
    });
  }

  const isPartOfProject = isProjectConversation(conversation);

  if (isPartOfProject) {
    const projectDatasourceView = await getProjectContextDataSourceView(
      auth,
      conversation
    );

    if (!projectDatasourceView) {
      logger.warn(
        { conversationId: conversation.sId },
        "Project context datasource view not found for conversation."
      );
    } else {
      dataSources.push({
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceViewId: projectDatasourceView.sId,
        filter: {
          // Intentionaly only search the project context folder, not the entire project.
          // The conversations from the project can be searched using the project search action.
          parents: { in: [PROJECT_CONTEXT_FOLDER_ID], not: [] },
          tags: null,
        },
      });
    }
  }

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
    description: isPartOfProject
      ? `Semantic search over all files attached to the conversation and project context`
      : "Semantic search over all files attached to the conversation",
    dataSources,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: retrievalView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: retrievalView.mcpServerId,
  };
}
