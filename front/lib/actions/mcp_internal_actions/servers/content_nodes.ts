import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { fetchAgentDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { CoreAPI, Err, Ok, removeNulls } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  // TODO(2025-05-30 aubin): find a better name (currently not great in Agent Builder).
  // Maybe browse_internal_data, browse_data_sources, browse_hierarchy?
  name: "content_nodes",
  version: "1.0.0",
  description:
    "Comprehensive tools to browse, search, and navigate the content nodes hierarchy. Includes Unix-like commands (ls, find) and advanced filtering capabilities.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "search_by_title",
    `List all nodes whose title match the query title. This is the equivalent of a find -name in Unix.
    It operates on the content node hierarchy.`,
    {
      query: z.string().describe(
        `The title to search for. This query parameter supports prefix-based search.
          For instance, if the title is "Hello World", the query "Hello" will return the node "Hello World".`
      ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of nodes to retrieve."),
    },
    async ({ query, dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      const searchResult = await coreAPI.searchNodes({
        query,
        filter: {
          data_source_views: agentDataSourceConfigurations.map(
            ({ dataSource, dataSourceView }) => ({
              data_source_id: dataSource.dustAPIDataSourceId,
              view_filter: dataSourceView.parentsIn ?? [],
            })
          ),
        },
        options: {
          limit,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes");
      }

      return makeMCPToolJSONSuccess({
        message: "Search successful.",
        result: searchResult.value,
      });
    }
  );

  server.tool(
    "list_children",
    `List direct children of a parent node. This is the equivalent of 'ls' in Unix.
    Use this to explore the immediate contents of a folder or container node.`,
    {
      parentId: z
        .string()
        .describe("The node ID of the parent whose children you want to list."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of children to retrieve."),
    },
    async ({ parentId, dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      const searchResult = await coreAPI.searchNodes({
        filter: {
          data_source_views: agentDataSourceConfigurations.map(
            ({ dataSource, dataSourceView }) => ({
              data_source_id: dataSource.dustAPIDataSourceId,
              view_filter: dataSourceView.parentsIn ?? [],
            })
          ),
          parent_id: parentId,
        },
        options: {
          limit,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to list children");
      }

      return makeMCPToolJSONSuccess({
        message: "Children listed successfully.",
        result: searchResult.value,
      });
    }
  );

  server.tool(
    "search_by_id",
    `Find specific nodes by their IDs. Use this when you know the exact node IDs you're looking for.`,
    {
      nodeIds: z.array(z.string()).describe("Array of node IDs to search for."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    async ({ nodeIds, dataSources }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      const searchResult = await coreAPI.searchNodes({
        filter: {
          data_source_views: agentDataSourceConfigurations.map(
            ({ dataSource, dataSourceView }) => ({
              data_source_id: dataSource.dustAPIDataSourceId,
              view_filter: dataSourceView.parentsIn ?? [],
            })
          ),
          node_ids: nodeIds,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes by ID");
      }

      return makeMCPToolJSONSuccess({
        message: "Nodes found successfully.",
        result: searchResult.value,
      });
    }
  );

  server.tool(
    "list_root_nodes",
    `List top-level nodes (nodes with no parent). Use this to explore the root level of the content hierarchy.`,
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of root nodes to retrieve."),
    },
    async ({ dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      const searchResult = await coreAPI.searchNodes({
        filter: {
          data_source_views: agentDataSourceConfigurations.map(
            ({ dataSource, dataSourceView }) => ({
              data_source_id: dataSource.dustAPIDataSourceId,
              view_filter: dataSourceView.parentsIn ?? [],
            })
          ),
          parent_id: "root",
        },
        options: {
          limit,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to list root nodes");
      }

      return makeMCPToolJSONSuccess({
        message: "Root nodes listed successfully.",
        result: searchResult.value,
      });
    }
  );

  server.tool(
    "search_by_type",
    `Filter nodes by their type (document, table, folder). Use this to find all nodes of a specific type.`,
    {
      nodeTypes: z
        .array(z.enum(["document", "table", "folder"]))
        .describe("Array of node types to search for."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of nodes to retrieve."),
    },
    async ({ nodeTypes, dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      const searchResult = await coreAPI.searchNodes({
        filter: {
          data_source_views: agentDataSourceConfigurations.map(
            ({ dataSource, dataSourceView }) => ({
              data_source_id: dataSource.dustAPIDataSourceId,
              view_filter: dataSourceView.parentsIn ?? [],
            })
          ),
          node_types: nodeTypes,
        },
        options: {
          limit,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes by type");
      }

      return makeMCPToolJSONSuccess({
        message: "Nodes found successfully.",
        result: searchResult.value,
      });
    }
  );

  // TODO(2025-06-01 aubin): re-enable this if useful and once mime type filtering is implemented.
  // server.tool(
  //   "search_by_mime_type",
  //   `Filter nodes by their MIME type. Use this to find nodes with specific content types.`,
  //   {
  //     mimeTypes: z
  //       .array(z.string())
  //       .describe(
  //         "Array of MIME types to search for (e.g., 'text/plain', 'application/pdf')."
  //       ),
  //     dataSources:
  //       ConfigurableToolInputSchemas[
  //         INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
  //       ],
  //     limit: z
  //       .number()
  //       .optional()
  //       .describe("Maximum number of nodes to retrieve."),
  //   },
  //   async ({ mimeTypes, dataSources, limit }) => {
  //     const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  //     const fetchResult = await getAgentDataSourceConfigurations(dataSources);
  //
  //     if (fetchResult.isErr()) {
  //       return makeMCPToolTextError(fetchResult.error.message);
  //     }
  //     const agentDataSourceConfigurations = fetchResult.value;
  //
  //     // Use excluded_node_mime_types with a workaround since there's no direct include filter
  //     // We'll search all nodes and filter client-side for now
  //     const searchResult = await coreAPI.searchNodes({
  //       filter: {
  //         data_source_views: agentDataSourceConfigurations.map(
  //           ({ dataSource, dataSourceView }) => ({
  //             data_source_id: dataSource.dustAPIDataSourceId,
  //             view_filter: dataSourceView.parentsIn ?? [],
  //           })
  //         ),
  //       },
  //       options: {
  //         limit: limit ? limit * 10 : 1000, // Get more results to filter
  //       },
  //     });
  //
  //     if (searchResult.isErr()) {
  //       return makeMCPToolTextError("Failed to search nodes by MIME type");
  //     }
  //
  //     // Filter results by MIME type client-side
  //     const filteredNodes = searchResult.value.nodes.filter((node) =>
  //       mimeTypes.includes(node.mime_type)
  //     );
  //
  //     // Apply limit after filtering
  //     const limitedNodes = limit
  //       ? filteredNodes.slice(0, limit)
  //       : filteredNodes;
  //
  //     return makeMCPToolJSONSuccess({
  //       message: "Nodes found successfully.",
  //       result: {
  //         ...searchResult.value,
  //         nodes: limitedNodes,
  //         hit_count: limitedNodes.length,
  //       },
  //     });
  //   }
  // );

  server.tool(
    "search_by_parent_path",
    `Search nodes that have specific parents in their hierarchy. Use this to find all nodes under a particular path.`,
    {
      parentIds: z
        .array(z.string())
        .describe(
          "Array of parent IDs that should be in the node's parents hierarchy."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of nodes to retrieve."),
    },
    async ({ parentIds, dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      // TODO(2025-06-01 aubin): update semantics to support this.
      // Search all nodes and filter client-side for nodes that have the specified parents
      const searchResult = await coreAPI.searchNodes({
        filter: {
          data_source_views: agentDataSourceConfigurations.map(
            ({ dataSource, dataSourceView }) => ({
              data_source_id: dataSource.dustAPIDataSourceId,
              view_filter: dataSourceView.parentsIn ?? [],
            })
          ),
        },
        options: {
          limit: limit ? limit * 10 : 1000,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes by parent path.");
      }

      // Filter results to nodes that have all specified parent IDs in their parents array
      const filteredNodes = searchResult.value.nodes.filter((node) =>
        parentIds.every((parentId) => node.parents.includes(parentId))
      );

      // Apply limit after filtering
      const limitedNodes = limit
        ? filteredNodes.slice(0, limit)
        : filteredNodes;

      return makeMCPToolJSONSuccess({
        message: "Nodes found successfully.",
        result: {
          ...searchResult.value,
          nodes: limitedNodes,
          hit_count: limitedNodes.length,
        },
      });
    }
  );

  return server;
};

async function getAgentDataSourceConfigurations(
  dataSources: DataSourcesToolConfigurationType
): Promise<Result<AgentDataSourceConfiguration[], Error>> {
  const agentDataSourceConfigurationsResults = await concurrentExecutor(
    dataSources,
    async (dataSourceConfiguration) =>
      fetchAgentDataSourceConfiguration(dataSourceConfiguration),
    { concurrency: 10 }
  );

  if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
    return new Err(new Error("Failed to fetch data source configurations."));
  }

  return new Ok(
    removeNulls(
      agentDataSourceConfigurationsResults.map((res) =>
        res.isOk() ? res.value : null
      )
    )
  );
}

export default createServer;
