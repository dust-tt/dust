import { DEFAULT_PROJECT_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { ContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentFragmentDataSourceNode,
  isContentNodeAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { getProjectContextDataSourceView } from "@app/lib/api/assistant/jit/utils";
import { listProjectContextAttachments } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";

/**
 * One config per data source view; merges parent node ids when several project context
 * nodes point at the same view (same pattern as skill knowledge merging).
 */
function mergeContentNodeDataSourceConfigurations(
  workspaceId: string,
  nodes: ContentNodeAttachmentType[]
): DataSourceConfiguration[] {
  const byViewId = new Map<
    string,
    { hasFullView: boolean; parentIds: Set<string> }
  >();

  for (const node of nodes) {
    const viewId = node.nodeDataSourceViewId;
    let agg = byViewId.get(viewId);
    if (!agg) {
      agg = { hasFullView: false, parentIds: new Set() };
      byViewId.set(viewId, agg);
    }
    if (isContentFragmentDataSourceNode(node)) {
      agg.hasFullView = true;
    } else {
      agg.parentIds.add(node.nodeId);
    }
  }

  return Array.from(byViewId.entries()).map(([dataSourceViewId, agg]) => ({
    workspaceId,
    dataSourceViewId,
    filter: {
      parents: agg.hasFullView
        ? null
        : {
            in: Array.from(agg.parentIds),
            not: [],
          },
      tags: null,
    },
  }));
}

/**
 * Get the project_search MCP server for searching project context: uploaded files
 * (project context data source view) plus searchable content-node references attached to the project.
 * Only available with "projects" feature flag and if conversation is in a project.
 */
export async function getProjectSearchServer(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType | null> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(auth);

  if (
    !featureFlags.includes("projects") ||
    !isProjectConversation(conversation)
  ) {
    return null;
  }

  const projectDatasourceView = await getProjectContextDataSourceView(
    auth,
    conversation
  );

  if (!projectDatasourceView) {
    return null;
  }

  const retrievalView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "search"
    );

  if (!retrievalView) {
    logger.error(
      { conversationId: conversation.sId },
      "MCP server view not found for search. Ensure auto tools are created."
    );
    return null;
  }

  const space = await SpaceResource.fetchById(auth, conversation.spaceId);
  let contentNodeDataSources: DataSourceConfiguration[] = [];
  if (!space) {
    logger.warn(
      {
        conversationId: conversation.sId,
        spaceId: conversation.spaceId,
      },
      "Space not found when building project search data sources; skipping attached nodes"
    );
  } else {
    const projectContextAttachments = await listProjectContextAttachments(
      auth,
      space
    );
    const searchableContentNodes = projectContextAttachments.filter(
      (a): a is ContentNodeAttachmentType =>
        isContentNodeAttachmentType(a) && a.isSearchable
    );
    contentNodeDataSources = mergeContentNodeDataSourceConfigurations(
      owner.sId,
      searchableContentNodes
    );
  }

  const dataSources: DataSourceConfiguration[] = [
    {
      workspaceId: owner.sId,
      dataSourceViewId: projectDatasourceView.sId,
      filter: {
        parents: null,
        tags: null,
      },
    },
    ...contentNodeDataSources,
  ];

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: DEFAULT_PROJECT_MANAGEMENT_SERVER_NAME,
    description: `Semantic search over the project context and conversations.`,
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
