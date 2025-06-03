import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  fetchAgentDataSourceConfiguration,
  getCoreSearchArgs,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset, getRetrievalTopK } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import {
  getDataSourceNameFromView,
  getDisplayNameForDocument,
} from "@app/lib/data_sources";
import type { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  CoreAPIContentNode,
  CoreAPISearchNodesResponse,
  Result,
} from "@app/types";
import {
  CoreAPI,
  dustManagedCredentials,
  Err,
  Ok,
  parseTimeFrame,
  removeNulls,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "data_sources_file_system",
  version: "1.0.0",
  description:
    "Comprehensive content navigation toolkit for browsing user data sources. Provides Unix-like " +
    "browsing (ls, find) and smart search tools to help agents efficiently explore and discover " +
    "documents, folders, and tables from manually uploaded files or data synced from SaaS products " +
    "(Notion, Slack, Github, etc.) organized in a filesystem-like hierarchy.",
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

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "find_by_title",
    "Find content items based on their title. Use this when you need to find specific " +
      "files, documents, folders, or other content by searching for their titles. This searches " +
      "through user-uploaded files and data synced from SaaS products (Notion, Slack, Github, " +
      "etc...). This is like using 'find -name' in Unix - it will find all items whose titles " +
      "contain or start with your search term. A good fit is when the user asks 'find the " +
      "document called X' or 'show me files with Y in the name'.",
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
    "find_by_id",
    "Retrieve specific content items when you have their exact IDs. Use this to get detailed " +
      "information about files, documents, or folders you've already identified from other searches. " +
      "This works with content from uploaded files or synced data sources (Notion, Slack, Github, etc.). " +
      "This is like looking up specific files by their unique identifiers. Only use this when you have " +
      "the exact id values from previous tool results.",
    {
      nodeIds: z
        .array(z.string())
        .describe(
          "Array of exact content item IDs to retrieve. These are the 'id' values from previous " +
            "search results. Each ID uniquely identifies a specific document, folder, or table."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      sortBy: OPTION_PARAMETERS["sortBy"],
      nextPageCursor: OPTION_PARAMETERS["nextPageCursor"],
    },
    async ({ nodeIds, dataSources, sortBy, nextPageCursor }) => {
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
        options: {
          cursor: nextPageCursor,
          sort: sortBy
            ? [{ field: sortBy, direction: getSortDirection(sortBy) }]
            : undefined,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search content by ID");
      }

      return makeMCPToolJSONSuccess({
        message: "Content items found successfully.",
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "list_files",
    "List the direct contents of a folder or container. Use this when you want to see what's " +
      "inside a specific folder from your uploaded files or synced data sources (Notion, Slack, " +
      "Github, etc.), like 'ls' in Unix. A good fit is when you need to explore the filesystem " +
      "structure step by step. This tool can be called repeatedly by passing the 'id' output " +
      "at a step to the next step's parentId.",
    {
      parentId: z
        .string()
        .describe(
          "The exact ID of the folder/container whose contents you want to list. " +
            "Get this ID from previous search results (it's the 'id' field)."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      ...OPTION_PARAMETERS,
    },
    async ({ parentId, dataSources, limit, sortBy, nextPageCursor }) => {
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
          cursor: nextPageCursor,
          limit,
          sort: sortBy
            ? [{ field: sortBy, direction: getSortDirection(sortBy) }]
            : undefined,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to list folder contents");
      }

      return makeMCPToolJSONSuccess({
        message: "Folder contents listed successfully.",
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "list_root_items",
    "Show the top-level folders and files in the data sources - the starting point of the " +
      "filesystem hierarchy. Use this when you want to begin exploring your uploaded files or " +
      "synced data from SaaS products (Notion, Slack, Github, etc.). This is like listing the " +
      "root directory - it shows you the highest-level content items.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      ...OPTION_PARAMETERS,
    },
    async ({ dataSources, limit, sortBy, nextPageCursor }) => {
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
          cursor: nextPageCursor,
          limit,
          sort: sortBy
            ? [{ field: sortBy, direction: getSortDirection(sortBy) }]
            : undefined,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to list root content");
      }

      return makeMCPToolJSONSuccess({
        message: "Root content listed successfully.",
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "find_by_type",
    "Find all content of a specific type from your uploaded files or synced data sources (Notion, " +
      "Slack, Github, etc.). Use this to retrieve all documents, all spreadsheets/tables, or all " +
      "folders. Good fits are requests like 'show me all the documents', 'find all spreadsheets', " +
      "or 'list all folders'.",
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
      ...OPTION_PARAMETERS,
    },
    async ({ nodeTypes, dataSources, limit, sortBy, nextPageCursor }) => {
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
          cursor: nextPageCursor,
          limit,
          sort: sortBy
            ? [{ field: sortBy, direction: getSortDirection(sortBy) }]
            : undefined,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search content by type");
      }

      return makeMCPToolJSONSuccess({
        message: "Content items found successfully.",
        result: renderSearchResults(searchResult.value),
      });
    }
  );

  server.tool(
    "search",
    "Perform a semantic search within the folders and files designated by `nodeIds`. All children " +
      "of the designated nodes will be searched.",
    {
      nodeIds: z
        .array(z.string())
        .describe(
          "Array of exact content node IDs to search within. These are the 'id' values from " +
            "previous search results, which can be folders or files. All children of the designated " +
            "nodes will be searched. If not provided, all available files and folders will be searched."
        )
        .optional(),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      query: z
        .string()
        .describe(
          "The query to search for. This is a natural language query. It doesn't support any " +
            "specific filter syntax."
        ),

      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .describe(
          "The time frame (relative to LOCAL_TIME) to restrict the search based on the file updated " +
            "time." +
            " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
            " where {k} is a number. Be strict, do not invent invalid values."
        ),
    },
    async ({ nodeIds, dataSources, query, relativeTimeFrame }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const credentials = dustManagedCredentials();
      const timeFrame = parseTimeFrame(relativeTimeFrame);

      if (!agentLoopContext?.runContext) {
        throw new Error(
          "agentLoopRunContext is required where the tool is called."
        );
      }

      // Compute the topK and refsOffset for the search.
      const topK = getRetrievalTopK({
        agentConfiguration: agentLoopContext.runContext.agentConfiguration,
        stepActions: agentLoopContext.runContext.stepActions,
      });
      const refsOffset = actionRefsOffset({
        agentConfiguration: agentLoopContext.runContext.agentConfiguration,
        stepActionIndex: agentLoopContext.runContext.stepActionIndex,
        stepActions: agentLoopContext.runContext.stepActions,
        refsOffset: agentLoopContext.runContext.citationsRefsOffset,
      });

      const coreSearchArgsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          getCoreSearchArgs(auth, dataSourceConfiguration),
        { concurrency: 10 }
      );

      const coreSearchArgs = removeNulls(
        coreSearchArgsResults.map((res) => (res.isOk() ? res.value : null))
      ).map((coreSearchArgs) => {
        if (!nodeIds) {
          // If the agent doesn't provide nodeIds, we keep the default filter.
          return coreSearchArgs;
        }

        return {
          ...coreSearchArgs,
          filter: {
            ...coreSearchArgs.filter,
            parents: { in: nodeIds, not: [] },
          },
        };
      });

      if (coreSearchArgs.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Search action must have at least one data source configured.",
            },
          ],
        };
      }

      const searchResults = await coreAPI.searchDataSources(
        query,
        topK,
        credentials,
        false,
        coreSearchArgs.map((args) => {
          return {
            projectId: args.projectId,
            dataSourceId: args.dataSourceId,
            filter: {
              ...args.filter,
              tags: {
                in: null,
                not: null,
              },
              timestamp: {
                gt: timeFrame ? timeFrameFromNow(timeFrame) : null,
                lt: null,
              },
            },
            view_filter: args.view_filter,
          };
        })
      );

      if (searchResults.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: searchResults.error.message,
            },
          ],
        };
      }

      if (refsOffset + topK > getRefs().length) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "The search exhausted the total number of references available for citations",
            },
          ],
        };
      }

      const refs = getRefs().slice(refsOffset, refsOffset + topK);

      const results = searchResults.value.documents.map((doc) => {
        const dataSourceView = coreSearchArgs.find(
          (args) =>
            args.dataSourceView.dataSource.dustAPIDataSourceId ===
            doc.data_source_id
        )?.dataSourceView;

        assert(dataSourceView, "DataSource view not found");

        return {
          // TODO: use proper mime type, but curently useful to debug.
          // mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
          uri: doc.source_url ?? "",
          text: `"${getDisplayNameForDocument(doc)}" (${doc.chunks.length} chunks)`,

          id: doc.document_id,
          source: {
            provider: dataSourceView.dataSource.connectorProvider ?? undefined,
            name: getDataSourceNameFromView(dataSourceView),
          },
          tags: doc.tags,
          ref: refs.shift() as string,
          chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
        };
      });

      return {
        isError: false,
        content: [
          ...results.map((result) => ({
            type: "resource" as const,
            resource: result,
          })),
        ],
      };
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
    id: node.node_id,
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
