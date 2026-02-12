// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { renderNode } from "@app/lib/actions/mcp_internal_actions/rendering";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { ensureAuthorizedDataSourceViews } from "@app/lib/actions/mcp_internal_actions/utils/data_source_views";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { Err, Ok } from "@app/types/shared/result";

export async function cat(
  {
    dataSources,
    nodeId,
    offset,
    limit,
    grep,
  }: {
    dataSources: DataSourcesToolConfigurationType;
    nodeId: string;
    offset?: number;
    limit?: number;
    grep?: string;
  },
  {
    auth,
    agentLoopContext,
  }: { auth?: Authenticator; agentLoopContext?: AgentLoopContextType }
) {
  if (!auth) {
    return new Err(new MCPError("Authentication required"));
  }
  if (!agentLoopContext?.runContext) {
    return new Err(new MCPError("No conversation context available"));
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Gather data source configurations.
  const fetchResult = await getAgentDataSourceConfigurations(auth, dataSources);

  if (fetchResult.isErr()) {
    return fetchResult;
  }
  const agentDataSourceConfigurations = fetchResult.value;

  const authRes = await ensureAuthorizedDataSourceViews(
    auth,
    agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
  );
  if (authRes.isErr()) {
    return new Err(authRes.error);
  }

  const conflictingTags = checkConflictingTags(
    agentDataSourceConfigurations.map(({ filter }) => filter.tags),
    {}
  );
  if (conflictingTags) {
    return new Err(new MCPError(conflictingTags, { tracked: false }));
  }

  // Search the node using our search api.
  const searchResult = await coreAPI.searchNodes({
    filter: {
      node_ids: [nodeId],
      data_source_views: makeCoreSearchNodesFilters({
        agentDataSourceConfigurations,
      }),
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

  const { citationsOffset } = agentLoopContext.runContext.stepContext;

  if (citationsOffset >= getRefs().length) {
    return new Err(
      new MCPError("Unable to provide a citation for this document")
    );
  }

  const ref = getRefs()[citationsOffset];

  return new Ok([
    {
      type: "resource" as const,
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_CONTENT,
        uri: node.source_url ?? "",
        text: readResult.value.text,
        metadata: renderNode(node, dataSourceIdToConnectorMap),
        ref: ref,
      },
    },
  ]);
}
