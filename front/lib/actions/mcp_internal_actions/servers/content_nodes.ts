import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { fetchAgentDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { CoreAPI, removeNulls } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  // TODO(2025-05-30 aubin): find a better name (currently not great in Agent Builder).
  // Maybe browse_internal_data?
  name: "content_nodes",
  version: "1.0.0",
  description: "Tools to browse and search within the content nodes hierarchy.",
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
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

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
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

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
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

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
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

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
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

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

  server.tool(
    "search_by_mime_type",
    `Filter nodes by their MIME type. Use this to find nodes with specific content types.`,
    {
      mimeTypes: z
        .array(z.string())
        .describe(
          "Array of MIME types to search for (e.g., 'text/plain', 'application/pdf')."
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
    async ({ mimeTypes, dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

      // Use excluded_node_mime_types with a workaround since there's no direct include filter
      // We'll search all nodes and filter client-side for now
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
          limit: limit ? limit * 10 : 1000, // Get more results to filter
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes by MIME type");
      }

      // Filter results by MIME type client-side
      const filteredNodes = searchResult.value.nodes.filter((node) =>
        mimeTypes.includes(node.mime_type)
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
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

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
          limit: limit ? limit * 10 : 1000, // Get more results to filter
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes by parent path");
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

  server.tool(
    "browse_hierarchy",
    `Get a hierarchical view starting from a specific node, showing its children and optionally grandchildren.`,
    {
      rootNodeId: z
        .string()
        .describe("The node ID to start the hierarchy browse from."),
      depth: z
        .number()
        .min(1)
        .max(3)
        .default(2)
        .describe("How many levels deep to browse (1-3)."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of nodes per level to retrieve."),
    },
    async ({ rootNodeId, depth, dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

      const dataSourceViews = agentDataSourceConfigurations.map(
        ({ dataSource, dataSourceView }) => ({
          data_source_id: dataSource.dustAPIDataSourceId,
          view_filter: dataSourceView.parentsIn ?? [],
        })
      );

      // First, get the root node
      const rootResult = await coreAPI.searchNodes({
        filter: {
          data_source_views: dataSourceViews,
          node_ids: [rootNodeId],
        },
      });

      if (rootResult.isErr()) {
        return makeMCPToolTextError("Failed to find root node");
      }

      if (rootResult.value.nodes.length === 0) {
        return makeMCPToolTextError("Root node not found");
      }

      const hierarchy: any = {
        root: rootResult.value.nodes[0],
        children: [],
      };

      // Get direct children
      const childrenResult = await coreAPI.searchNodes({
        filter: {
          data_source_views: dataSourceViews,
          parent_id: rootNodeId,
        },
        options: { limit },
      });

      if (childrenResult.isErr()) {
        return makeMCPToolTextError("Failed to get children");
      }

      hierarchy.children = childrenResult.value.nodes;

      // If depth > 1, get grandchildren
      if (depth > 1 && hierarchy.children.length > 0) {
        for (const child of hierarchy.children) {
          const grandchildrenResult = await coreAPI.searchNodes({
            filter: {
              data_source_views: dataSourceViews,
              parent_id: child.node_id,
            },
            options: { limit },
          });

          if (grandchildrenResult.isOk()) {
            (child as any).children = grandchildrenResult.value.nodes;
          }
        }
      }

      return makeMCPToolJSONSuccess({
        message: "Hierarchy browsed successfully.",
        result: hierarchy,
      });
    }
  );

  return server;
};

export default createServer;
