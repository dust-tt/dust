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
import type {
  CoreAPIContentNode,
  CoreAPISearchNodesResponse,
  Result,
} from "@app/types";
import { CoreAPI, Err, Ok, removeNulls } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  // TODO(2025-05-30 aubin): find a better name (currently not great in Agent Builder).
  // Maybe browse_internal_data, browse_data_sources, browse_hierarchy?
  name: "content_nodes",
  version: "1.0.0",
  description:
    "Comprehensive content navigation toolkit. Provides Unix-like browsing (ls, find) and smart " +
    "search tools to help agents efficiently explore and discover documents, folders, and tables " +
    "within organizational content hierarchies.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "search_by_title",
    "Search for content nodes by their title or name. Use this when you need to find specific " +
      "files, documents, folders, or other content by searching for their titles. This is like using " +
      "'find -name' in Unix - it will find all nodes whose titles contain or start with your search " +
      "term. A good fit is when the user asks 'find the document called X' or 'show me files with Y " +
      "in the name'.",
    {
      query: z
        .string()
        .describe(
          "The title or name to search for. This supports partial matching - you don't need the " +
            "exact title. For example, searching for 'budget' will find 'Budget 2024.xlsx', " +
            "'Q1 Budget Report', etc. Use keywords from the title the user mentioned."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of results to return. Use 10-20 for initial searches, increase if user needs more results."
        ),
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
          data_source_views: makeDataSourceViewFilter(
            agentDataSourceConfigurations
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
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "list_children",
    "List the direct contents of a node. Use this when you want to see what's inside a specific " +
      "node, like 'ls' in Unix. A good fit is when you need to explore the structure step by step.",
    {
      parentId: z
        .string()
        .describe(
          "The exact node ID of the folder/node whose contents you want to list. " +
            "Get this ID from previous search results (it's the 'node_id' field)."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of items to show. Use 20-50 for folder listings, increase if user wants to see more."
        ),
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
          data_source_views: makeDataSourceViewFilter(
            agentDataSourceConfigurations
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
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "search_by_id",
    "Retrieve specific content nodes when you have their exact IDs. Use this to get detailed " +
      "information about nodes you've already identified from other searches. This is like looking " +
      "up specific files by their unique identifiers. Only use this when you have the exact node_id " +
      "values from previous tool results.",
    {
      nodeIds: z
        .array(z.string())
        .describe(
          "Array of exact node IDs to retrieve. These are the 'node_id' values from previous " +
            "search results. Each ID uniquely identifies a specific document, folder, or table."
        ),
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
          data_source_views: makeDataSourceViewFilter(
            agentDataSourceConfigurations
          ),
          node_ids: nodeIds,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes by ID");
      }

      return makeMCPToolJSONSuccess({
        message: "Nodes found successfully.",
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "list_root_nodes",
    "Show the top-level folders and files in the data sources - the starting point of the content " +
      "hierarchy. Use this when you want to begin exploring the content structure. This is like " +
      "listing the root directory - it shows you the highest-level nodes.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of top-level items to show.."),
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
          data_source_views: makeDataSourceViewFilter(
            agentDataSourceConfigurations
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
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "search_by_type",
    "'Find all content of a specific type. Use this to retrieve all documents, all " +
      "spreadsheets/tables, or all folders. Good fits are requests like 'show me all the documents'," +
      "'find all spreadsheets', or 'list all folders'.",
    {
      nodeTypes: z
        .array(z.enum(["document", "table", "folder"]))
        .describe(
          "Types of content to find. Use 'document' for text files, PDFs, presentations, etc." +
            "Use 'table' for spreadsheets, Notion databases, structured data. Use 'folder' for " +
            "containers/directories. You can specify multiple types to get mixed results."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of items to return."),
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
          data_source_views: makeDataSourceViewFilter(
            agentDataSourceConfigurations
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
        result: renderSearchResults(searchResult.value),
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
  //         data_source_views: makeDataSourceViewFilter(
  //           agentDataSourceConfigurations
  //         )
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
    "Find all content that exists anywhere within specific nodes in the hierarchy. Use this to" +
      "find everything under certain paths, including items in subfolders. This searches the entire" +
      "subtree, not just direct children.",
    {
      parentIds: z
        .array(z.string())
        .describe(
          "Array of parent folder/container IDs to search within. Get these IDs from previous" +
            "search results. The tool will find all content that has ANY of these IDs in its parent" +
            "hierarchy (meaning it's somewhere under these folders)."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of items to return."),
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
          data_source_views: makeDataSourceViewFilter(
            agentDataSourceConfigurations
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

      const filteredResult = {
        ...searchResult.value,
        nodes: limitedNodes,
        hit_count: limitedNodes.length,
      };

      return makeMCPToolJSONSuccess({
        message: "Nodes found successfully.",
        result: renderSearchResults(filteredResult),
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

function makeDataSourceViewFilter(
  agentDataSourceConfigurations: AgentDataSourceConfiguration[]
) {
  return agentDataSourceConfigurations.map(
    ({ dataSource, dataSourceView }) => ({
      data_source_id: dataSource.dustAPIDataSourceId,
      view_filter: dataSourceView.parentsIn ?? [],
    })
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (diffDays === 0) {
    return `${formattedDate} (today)`;
  } else if (diffDays === 1) {
    return `${formattedDate} (yesterday)`;
  } else if (diffDays < 7) {
    return `${formattedDate} (${diffDays} days ago)`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${formattedDate} (${weeks} week${weeks > 1 ? "s" : ""} ago)`;
  } else {
    return formattedDate;
  }
}

function renderNode(node: CoreAPIContentNode) {
  return {
    node_id: node.node_id,
    node_type: node.node_type,
    title: node.title,
    parent_id: node.parent_id,
    parents: node.parents,
    parent_title: node.parent_title,
    children_count: node.children_count,
    last_updated_at: formatTimestamp(node.timestamp),
    source_url: node.source_url,
    hierarchy_depth: node.parents.length,
  };
}

function renderSearchResults(response: CoreAPISearchNodesResponse) {
  return {
    nodes: response.nodes.map(renderNode),
    next_page_cursor: response.next_page_cursor,
    hit_count: response.hit_count,
  };
}

export default createServer;
