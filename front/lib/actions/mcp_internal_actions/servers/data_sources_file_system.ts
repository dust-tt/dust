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
  makeMCPToolRecoverableErrorSuccess,
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
  CoreAPIError,
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
      "Maximum number of results to return. Initial searches should use 10-20."
    ),
  sortBy: z
    .enum(["title", "timestamp"])
    .optional()
    .describe(
      "Field to sort the results by. 'title' sorts alphabetically A-Z, 'timestamp' sorts by " +
        "most recent first. If not specified, results are returned in default order, which is " +
        "folders first, then both documents and tables and alphabetically by title. " +
        "The default order should be kept unless there is a specific reason to change it."
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "Cursor for fetching the next page of results. This parameter should only be used to fetch " +
        "the next page of a previous search. The value should be exactly the 'nextPageCursor' from " +
        "the previous search result."
    ),
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "cat",
    "Read the contents of a document, referred to by its nodeId (named after the 'cat' unix tool). The nodeId can be obtained using the 'find_by_title', 'find' or 'search' tools.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      nodeId: z.string().describe("The ID of the node to read."),
    },
    async ({ dataSources, nodeId }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      // Gather data source configurations.
      const fetchResult = await getAgentDataSourceConfigurations(dataSources);

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
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
        return makeMCPToolRecoverableErrorSuccess(
          `Could not find node: ${nodeId} (error: ${
            searchResult.isErr() ? searchResult.error : "No nodes found"
          })`
        );
      }

      const node = searchResult.value.nodes[0];

      if (node.node_type !== "document") {
        return makeMCPToolRecoverableErrorSuccess(
          `Node is of type ${node.node_type}, not a document.`
        );
      }

      // Get dustAPIProjectId from the data source configuration.
      const dustAPIProjectId = agentDataSourceConfigurations.find(
        (config) =>
          config.dataSource.dustAPIDataSourceId === node.data_source_id
      )?.dataSource.dustAPIProjectId;

      if (!dustAPIProjectId) {
        return makeMCPToolTextError(
          `Could not find dustAPIProjectId for node: ${nodeId}`
        );
      }

      // Read the node.
      const readResult = await coreAPI.getDataSourceDocument({
        dataSourceId: node.data_source_id,
        documentId: node.node_id,
        projectId: dustAPIProjectId,
      });

      if (readResult.isErr()) {
        return makeMCPToolTextError(
          `Could not read node: ${nodeId} (error: ${readResult.error})`
        );
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: readResult.value.document.text ?? "",
          },
        ],
      };
    }
  );

  server.tool(
    "find",
    "Find content based on their title starting from a specific node. Can be used to to find specific " +
      "nodes by searching for their titles. The query title can be omitted to list all nodes " +
      "starting from a specific node. This is like using 'find' in Unix.",
    {
      query: z
        .string()
        .optional()
        .describe(
          "The title to search for. This supports partial matching and does not require the " +
            "exact title. For example, searching for 'budget' will find 'Budget 2024.xlsx', " +
            "'Q1 Budget Report', etc."
        ),
      rootNodeId: z
        .string()
        .optional()
        .describe(
          "The node ID of the node to start the search from. If not provided, the search will " +
            "start from the root of the filesystem. This ID can be found from previous search " +
            "results in the 'nodeId' field. This parameter restricts the search to the children " +
            "and descendant of a specific node."
        ),
      // TODO(2025-06-03 aubin): add search by mime type (not supported in the backend currently).
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
    "List the direct contents of a node. Can be used to see what is inside a specific folder from " +
      "the filesystem, like 'ls' in Unix. A good fit is to explore the filesystem structure step " +
      "by step. This tool can be called repeatedly by passing the 'nodeId' output from a step to " +
      "the next step's nodeId.",
    {
      nodeId: z
        .string()
        .nullable()
        .describe(
          "The exact ID of the node to list the contents of. " +
            "This ID can be found from previous search results in the 'nodeId' field. " +
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

  server.tool(
    "search",
    "Perform a semantic search within the folders and files designated by `nodeIds`. All children " +
      "of the designated nodes will be searched.",
    {
      nodeIds: z
        .array(z.string())
        .describe(
          "Array of exact content node IDs to search within. These are the 'nodeId' values from " +
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
    title: node.title,
    path: node.parents.join("/"),
    parentTitle: node.parent_title,
    lastUpdatedAt: formatTimestamp(node.timestamp),
    sourceUrl: node.source_url,
    // TODO(2025-06-02 aubin): see if we want a translation on these.
    mimeType: node.mime_type,
  };
}

/**
 * Translation from core's response to the format expected to the agent.
 * Removes references to the term 'content node' and simplifies the format.
 */
function renderSearchResults(response: CoreAPISearchNodesResponse) {
  return {
    data: response.nodes.map(renderNode),
    nextPageCursor: response.next_page_cursor,
    resultCount: response.hit_count,
  };
}

export default createServer;
