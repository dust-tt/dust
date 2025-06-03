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
  CoreAPIError,
  CoreAPISearchNodesResponse,
  Result,
} from "@app/types";
import { CoreAPI, Err, Ok, removeNulls } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "data_sources_file_system",
  version: "1.0.0",
  description:
    "Comprehensive content navigation toolkit for browsing user data sources. Provides Unix-like " +
    "browsing (ls, find) and smart search tools to help agents efficiently explore and discover " +
    "content from manually uploaded files or data synced from SaaS products (Notion, Slack, Github" +
    ", etc.) organized in a filesystem-like hierarchy. Each item in this tree-like hierarchy is " +
    "called a node, nodes are referenced by a nodeId.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
};

const OPTION_PARAMETERS = {
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of results to return. Use 10-20 for initial searches, " +
        "increase if user needs more results."
    ),
  sortBy: z
    .enum(["title", "timestamp"])
    .optional()
    .describe(
      "Sort results by field. Use 'title' to sort alphabetically A-Z, 'timestamp' to sort by " +
        "most recent first. If not specified, results are returned in default order, which is " +
        "folders first, then both documents and tables and alphabetically by title. " +
        "Keep the default order unless there is a specific reason to change it."
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "Cursor for fetching the next page of results. Use this parameter only to fetch the next " +
        "page of a previous search. The value should be exactly the 'next_page_cursor' from the " +
        "previous search result."
    ),
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "find",
    "Find content based on their title, type or other metadata. Use this when you need to find specific " +
      "files, documents, folders, or other content by searching for their titles. This searches " +
      "through user-uploaded files and data synced from SaaS products (Notion, Slack, Github, " +
      "etc...). This is like using 'find -name' in Unix - it will find all items whose titles " +
      "contain or start with your search term. A good fit is when the user asks 'find the " +
      "document called X' or 'show me files with Y in the name'.",
    {
      query: z
        .string()
        .optional()
        .describe(
          "The title to search for. This supports partial matching - you don't need the " +
            "exact title. For example, searching for 'budget' will find 'Budget 2024.xlsx', " +
            "'Q1 Budget Report', etc. Use keywords from the title the user mentioned."
        ),
      rootNodeId: z
        .string()
        .optional()
        .describe(
          "The node ID of the root node to start the search from. If not provided, the search will " +
            "start from the root of the data source. Get this ID from previous search results (it's " +
            "the 'nodeId' field). Use this parameter to restrict the search to the children and " +
            "descendant of a specific node."
        ),
      // TODO(2025-06-03 aubin): add search by mime type, requires adding the option to the endpoint in core.
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      ...OPTION_PARAMETERS,
    },
    async ({ query, dataSources, limit, sortBy, nextPageCursor }) => {
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
          cursor: nextPageCursor,
          limit,
          sort: sortBy
            ? [{ field: sortBy, direction: getSortDirection(sortBy) }]
            : undefined,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search content");
      }

      return makeMCPToolJSONSuccess({
        message: "Search successful.",
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "list",
    "List the direct contents of a node. Use this when you want to see what's " +
      "inside a specific folder from your uploaded files or synced data sources (Notion, Slack, " +
      "Github, etc.), like 'ls' in Unix. A good fit is when you need to explore the filesystem " +
      "structure step by step. This tool can be called repeatedly by passing the 'nodeId' output " +
      "from a step to the next step's nodeId.",
    {
      nodeId: z
        .string()
        .nullable()
        .describe(
          "The exact ID of the node whose contents you want to list. " +
            "Get this ID from previous search results (it's the 'nodeId' field). " +
            "If not provided, the content at the root of the filesystem will be shown."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      ...OPTION_PARAMETERS,
    },
    async ({ nodeId, dataSources, limit, sortBy, nextPageCursor }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      const dataSourceViewFilter = makeDataSourceViewFilter(
        agentDataSourceConfigurations
      );
      const options = {
        cursor: nextPageCursor,
        limit,
        sort: sortBy
          ? [{ field: sortBy, direction: getSortDirection(sortBy) }]
          : undefined,
      };

      let searchResult: Result<CoreAPISearchNodesResponse, CoreAPIError>;

      if (!nodeId) {
        // If we don't have a nodeId, we want to show the root nodes for the data source views, which are the parentsIn.
        // So we search these nodes by node_id.
        // TODO(2025-06-03 aubin): handle the root case where parentsIn is null.
        searchResult = await coreAPI.searchNodes({
          filter: {
            data_source_views: dataSourceViewFilter,
            node_ids: agentDataSourceConfigurations.flatMap(
              ({ dataSourceView }) => dataSourceView.parentsIn ?? []
            ),
          },
          options,
        });
      } else {
        searchResult = await coreAPI.searchNodes({
          filter: {
            data_source_views: dataSourceViewFilter,
            parent_id: nodeId,
          },
          options,
        });
      }

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to list folder contents");
      }

      return makeMCPToolJSONSuccess({
        message: "Content listed successfully.",
        result: renderSearchResults(searchResult.value),
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

function getSortDirection(field: "title" | "timestamp"): "asc" | "desc" {
  switch (field) {
    case "title":
      return "asc"; // Alphabetical A-Z.
    case "timestamp":
      return "desc"; // Most recent first.
  }
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

/**
 * Translation from a content node to the format expected to the agent.
 * Removes references to the term 'content node' and simplifies the format.
 */
function renderNode(node: CoreAPIContentNode) {
  return {
    nodeId: node.node_id,
    type: node.node_type,
    title: node.title,
    parent_id: node.parent_id,
    path: node.parents.join("/"),
    parent_title: node.parent_title,
    children_count: node.children_count,
    last_updated_at: formatTimestamp(node.timestamp),
    source_url: node.source_url,
    // TODO(2025-06-02 aubin): see if we want a translation on these.
    mime_type: node.mime_type,
  };
}

/**
 * Translation from core's response to the format expected to the agent.
 * Removes references to the term 'content node' and simplifies the format.
 */
function renderSearchResults(response: CoreAPISearchNodesResponse) {
  return {
    data: response.nodes.map(renderNode),
    next_page_cursor: response.next_page_cursor,
    result_count: response.hit_count,
  };
}

export default createServer;
