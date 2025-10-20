import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { renderNode } from "@app/lib/actions/mcp_internal_actions/rendering";
import { FILESYSTEM_CAT_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/server_constants";
import {
  getAgentDataSourceConfigurations,
  makeDataSourceViewFilter,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { CoreAPI, Err, Ok } from "@app/types";

const CatToolInputSchema = z.object({
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  nodeId: z
    .string()
    .describe(
      "The ID of the node to read. This is not the human-readable node title."
    ),
  offset: z
    .number()
    .optional()
    .describe(
      "The character position to start reading from (0-based). If not provided, starts from " +
        "the beginning."
    ),
  limit: z
    .number()
    .optional()
    .describe(
      "The maximum number of characters to read. If not provided, reads all characters."
    ),
  grep: z
    .string()
    .optional()
    .describe(
      "A regular expression to filter lines. Applied after offset/limit slicing. Only lines " +
        "matching this pattern will be returned."
    ),
});

export function makeCatToolImplementation(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType | undefined
) {
  const baseDescription =
    "Read the contents of a document, referred to by its nodeId (named after the 'cat' unix tool). " +
    "The nodeId can be obtained using the 'find', 'list' or 'search' tools.";

  async function catToolCallback({
    dataSources,
    nodeId,
    offset,
    limit,
    grep,
  }: z.infer<typeof CatToolInputSchema>) {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    // Gather data source configurations.
    const fetchResult = await getAgentDataSourceConfigurations(
      auth,
      dataSources
    );

    if (fetchResult.isErr()) {
      return new Err(new MCPError(fetchResult.error.message));
    }
    const agentDataSourceConfigurations = fetchResult.value;

    // Search the node using our search api.
    const searchResult = await coreAPI.searchNodes({
      filter: {
        node_ids: [nodeId],
        data_source_views: makeDataSourceViewFilter(
          agentDataSourceConfigurations
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

  return {
    baseDescription,
    schema: CatToolInputSchema.shape,
    callback: withToolLogging(
      auth,
      {
        toolNameForMonitoring: FILESYSTEM_CAT_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      catToolCallback
    ),
  };
}
