import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { FilesystemPathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  extractDataSourceIdFromNodeId,
  isDataSourceNodeId,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/utils";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { DataSourceFilesystemLocateTreeInputType } from "@app/lib/actions/mcp_internal_actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ContentNodeType, CoreAPIContentNode, Result } from "@app/types";
import { CoreAPI, DATA_SOURCE_NODE_ID, Err, Ok, removeNulls } from "@app/types";

export async function locateTreeCallback(
  auth: Authenticator,
  { nodeId, dataSources }: DataSourceFilesystemLocateTreeInputType,
  { tagsIn, tagsNot }: { tagsIn?: string[]; tagsNot?: string[] } = {}
): Promise<Result<CallToolResult["content"], MCPError>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const fetchResult = await getAgentDataSourceConfigurations(auth, dataSources);

  if (fetchResult.isErr()) {
    return new Err(new MCPError(fetchResult.error.message));
  }
  const agentDataSourceConfigurations = fetchResult.value;

  const conflictingTags = checkConflictingTags(
    agentDataSourceConfigurations.map(({ filter }) => filter.tags),
    { tagsIn, tagsNot }
  );
  if (conflictingTags) {
    return new Err(new MCPError(conflictingTags, { tracked: false }));
  }

  if (isDataSourceNodeId(nodeId)) {
    const dataSourceId = extractDataSourceIdFromNodeId(nodeId);
    if (!dataSourceId) {
      return new Err(
        new MCPError("Invalid data source node ID format", {
          tracked: false,
        })
      );
    }

    const dataSourceConfig = agentDataSourceConfigurations.find(
      ({ dataSource }) => dataSource.dustAPIDataSourceId === dataSourceId
    );

    if (!dataSourceConfig) {
      return new Err(
        new MCPError(`Data source not found for ID: ${dataSourceId}`, {
          tracked: false,
        })
      );
    }

    return new Ok([
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILESYSTEM_PATH,
          uri: "",
          text: "Node is the data source root.",
          path: [
            {
              nodeId: nodeId,
              title: dataSourceConfig.dataSource.name,
              isCurrentNode: true,
            },
          ],
        },
      },
    ]);
  }

  // Search for the target node.
  const searchResult = await coreAPI.searchNodes({
    filter: {
      node_ids: [nodeId],
      data_source_views: makeCoreSearchNodesFilters(
        agentDataSourceConfigurations,
        { tagsIn, tagsNot }
      ),
    },
  });

  if (searchResult.isErr() || searchResult.value.nodes.length === 0) {
    return new Err(
      new MCPError(`Could not find node: ${nodeId}`, { tracked: false })
    );
  }

  const targetNode = searchResult.value.nodes[0];

  const dataSourceRootId = `${DATA_SOURCE_NODE_ID}-${targetNode.data_source_id}`;

  // Build path node IDs excluding the data source root and target node.
  const parentNodeIds = targetNode.parents
    .filter((parentId) => parentId !== nodeId)
    .reverse();

  // Fetch the parent nodes (we already have the target node)
  const pathNodes: Record<string, CoreAPIContentNode> = {};
  if (parentNodeIds.length > 0) {
    const pathSearchResult = await coreAPI.searchNodes({
      filter: {
        node_ids: parentNodeIds,
        data_source_views: makeCoreSearchNodesFilters(
          agentDataSourceConfigurations,
          { tagsIn, tagsNot }
        ),
      },
    });

    if (pathSearchResult.isErr()) {
      return new Err(new MCPError("Failed to fetch nodes in the path"));
    }

    for (const node of pathSearchResult.value.nodes) {
      pathNodes[node.node_id] = node;
    }
  }

  const dataSourceConfig = agentDataSourceConfigurations.find(
    ({ dataSource }) =>
      dataSource.dustAPIDataSourceId === targetNode.data_source_id
  );

  if (!dataSourceConfig) {
    return new Err(new MCPError("Could not find data source configuration"));
  }

  // Build the path array.
  const pathItems: FilesystemPathType["path"] = removeNulls([
    // Data source root node
    {
      nodeId: dataSourceRootId,
      title: dataSourceConfig.dataSource.name,
      nodeType: "folder" as ContentNodeType,
      sourceUrl: null,
      isCurrentNode: false,
    },
    // Parent nodes
    ...parentNodeIds.map((parentId) => {
      const node = pathNodes[parentId];
      if (!node) {
        return null;
      }
      return {
        nodeId: parentId,
        title: node.title,
        nodeType: node.node_type,
        sourceUrl: node.source_url,
        isCurrentNode: false,
      };
    }),
    // Target node (always last)
    {
      nodeId: nodeId,
      title: targetNode.title,
      nodeType: targetNode.node_type,
      sourceUrl: targetNode.source_url,
      isCurrentNode: true,
    },
  ]);

  return new Ok([
    {
      type: "resource" as const,
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILESYSTEM_PATH,
        uri: "",
        text: "Path located successfully.",
        path: pathItems,
      },
    },
  ]);
}
