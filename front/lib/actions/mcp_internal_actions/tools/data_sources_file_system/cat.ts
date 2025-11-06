import type { Result } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { renderNode } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type {
  DataSourceFilesystemCatInputType,
  TagsInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import { ensureAuthorizedDataSourceViews } from "@app/lib/actions/mcp_internal_actions/utils/data_source_views";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { CoreAPI, Err, Ok } from "@app/types";

export async function catCallback(
  auth: Authenticator,
  {
    dataSources,
    nodeId,
    offset,
    limit,
    grep,
  }: DataSourceFilesystemCatInputType,
  additionalDynamicTags: TagsInputType = {}
): Promise<Result<CallToolResult["content"], MCPError>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Gather data source configurations.
  const fetchResult = await getAgentDataSourceConfigurations(auth, dataSources);

  if (fetchResult.isErr()) {
    return new Err(new MCPError(fetchResult.error.message));
  }
  const agentDataSourceConfigurations = fetchResult.value;

  const authRes = await ensureAuthorizedDataSourceViews(
    auth,
    agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
  );
  if (authRes.isErr()) {
    return new Err(authRes.error);
  }

  // Search the node using our search api.
  const searchResult = await coreAPI.searchNodes({
    filter: {
      node_ids: [nodeId],
      data_source_views: makeCoreSearchNodesFilters(
        agentDataSourceConfigurations,
        additionalDynamicTags
      ),
    },
  });

  if (searchResult.isErr() || searchResult.value.nodes.length === 0) {
    return new Err(
      new MCPError(
        `Could not find node: ${nodeId} (error: ${
          searchResult.isErr() ? searchResult.error.message : "No nodes found"
        })`,
        { tracked: false }
      )
    );
  }

  const node = searchResult.value.nodes[0];

  if (node.node_type !== "document") {
    return new Err(
      new MCPError(`Node is of type ${node.node_type}, not a document.`, {
        tracked: false,
      })
    );
  }

  // Get dataSource from the data source configuration.
  const dataSource = agentDataSourceConfigurations.find(
    (config) => config.dataSource.dustAPIDataSourceId === node.data_source_id
  )?.dataSource;

  if (!dataSource) {
    return new Err(
      new MCPError(`Could not find dataSource for node: ${nodeId}`)
    );
  }

  const dataSourceIdToConnectorMap = new Map();
  dataSourceIdToConnectorMap.set(
    dataSource.dustAPIDataSourceId,
    dataSource.connectorProvider
  );

  // Read the node.
  const readResult = await coreAPI.getDataSourceDocumentText({
    dataSourceId: node.data_source_id,
    documentId: node.node_id,
    projectId: dataSource.dustAPIProjectId,
    offset: offset,
    limit: limit,
    grep: grep,
  });

  if (readResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not read node: ${nodeId} (error: ${readResult.error.message})`,
        {
          tracked: readResult.error.code !== "invalid_regex",
        }
      )
    );
  }

  return new Ok([
    {
      type: "resource" as const,
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_CONTENT,
        uri: node.source_url ?? "",
        text: readResult.value.text,
        metadata: renderNode(node, dataSourceIdToConnectorMap),
      },
    },
  ]);
}
