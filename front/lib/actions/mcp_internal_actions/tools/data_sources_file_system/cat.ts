import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { FILESYSTEM_CAT_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { renderNode } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { ensureAuthorizedDataSourceViews } from "@app/lib/actions/mcp_internal_actions/utils/data_source_views";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { CoreAPI, Err, Ok } from "@app/types";

const catToolInputSchema = {
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
};

export function registerCatTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined,
  // TODO(2025-08-28 aubin): determine whether we want to allow an extra description or instead
  //  encourage putting extra details in the server instructions, which are passed to the instructions.
  { name, extraDescription }: { name: string; extraDescription?: string }
) {
  const baseDescription =
    "Read the contents of a document, referred to by its nodeId (named after the 'cat' unix tool). " +
    "The nodeId can be obtained using the 'find', 'list' or 'search' tools.";
  const toolDescription = extraDescription
    ? baseDescription + "\n" + extraDescription
    : baseDescription;

  server.tool(
    name,
    toolDescription,
    catToolInputSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FILESYSTEM_CAT_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ dataSources, nodeId, offset, limit, grep }) => {
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
              agentDataSourceConfigurations
            ),
          },
        });

        if (searchResult.isErr() || searchResult.value.nodes.length === 0) {
          return new Err(
            new MCPError(
              `Could not find node: ${nodeId} (error: ${
                searchResult.isErr()
                  ? searchResult.error.message
                  : "No nodes found"
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
          (config) =>
            config.dataSource.dustAPIDataSourceId === node.data_source_id
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
              mimeType:
                INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_CONTENT,
              uri: node.source_url ?? "",
              text: readResult.value.text,
              metadata: renderNode(node, dataSourceIdToConnectorMap),
            },
          },
        ]);
      }
    )
  );
}
