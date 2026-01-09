import assert from "assert";

import { DEFAULT_PROJECT_SEARCH_ACTION_NAME } from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import { getProjectContextDataSourceView } from "@app/lib/api/assistant/jit/utils";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { ConversationWithoutContentType } from "@app/types";

/**
 * Get the project_search MCP server for searching project context files.
 * Only available with "projects" feature flag and if conversation is in a project.
 */
export async function getProjectSearchServer(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType | null> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);

  if (!featureFlags.includes("projects") || !conversation.spaceId) {
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

  assert(
    retrievalView,
    "MCP server view not found for search. Ensure auto tools are created."
  );

  const dataSources: DataSourceConfiguration[] = [
    {
      workspaceId: owner.sId,
      dataSourceViewId: projectDatasourceView.sId,
      filter: {
        parents: null,
        tags: null,
      },
    },
  ];

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: DEFAULT_PROJECT_SEARCH_ACTION_NAME,
    description: `Semantic search over the project context`,
    dataSources,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    additionalConfiguration: {},
    mcpServerViewId: retrievalView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: retrievalView.mcpServerId,
  };
}
