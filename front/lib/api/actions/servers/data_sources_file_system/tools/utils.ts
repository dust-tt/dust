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
import {
  CoreAPI,
  DATA_SOURCE_NODE_ID,
  Err,
  Ok,
} from "@app/types/core/content_node";

/**
 * Check if a node ID represents a data source node.
 * Data source node IDs have the format: "datasource_node_id-{data_source_id}"
 */
export function isDataSourceNodeId(nodeId: string): boolean {
  return nodeId.startsWith(`${DATA_SOURCE_NODE_ID}-`);
}

/**
 * Extract the data source ID from a data source node ID.
 * Returns null if the node ID is not a data source node ID.
 */
export function extractDataSourceIdFromNodeId(nodeId: string): string | null {
  if (!isDataSourceNodeId(nodeId)) {
    return null;
  }

  return nodeId.substring(`${DATA_SOURCE_NODE_ID}-`.length);
}

/**
 * Read a document node text. Returns the raw text, node metadata, and citation
 * ref. Shared by cat, head, and tail tools.
 */
export async function readDocumentNode(
  {
    dataSources,
    nodeId,
  }: {
    dataSources: DataSourcesToolConfigurationType;
    nodeId: string;
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

  const dataSource = agentDataSourceConfigurations.find(
    (c) => c.dataSource.dustAPIDataSourceId === node.data_source_id
  )?.dataSource;

  if (!dataSource) {
    return new Err(
      new MCPError(`Could not find dataSource for node: ${nodeId}`)
    );
  }

  const dataSourceIdToConnectorMap = new Map<string, string | null>();
  dataSourceIdToConnectorMap.set(
    dataSource.dustAPIDataSourceId,
    dataSource.connectorProvider
  );

  const { citationsOffset } = agentLoopContext.runContext.stepContext;

  if (citationsOffset >= getRefs().length) {
    return new Err(
      new MCPError("Unable to provide a citation for this document")
    );
  }

  return new Ok({
    node,
    dataSource,
    dataSourceIdToConnectorMap,
    coreAPI,
    ref: getRefs()[citationsOffset],
  });
}

/**
 * Build the standard resource response for a document read tool.
 */
export function makeDocumentResource(
  readResult: {
    node: { source_url: string | null };
    dataSourceIdToConnectorMap: Map<string, string | null>;
    ref: string;
  },
  node: Parameters<typeof renderNode>[0],
  text: string
) {
  return new Ok([
    {
      type: "resource" as const,
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_CONTENT,
        uri: node.source_url ?? "",
        text,
        metadata: renderNode(node, readResult.dataSourceIdToConnectorMap),
        ref: readResult.ref,
      },
    },
  ]);
}
