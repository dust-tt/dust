import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { z } from "zod";

import { SEARCH_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  FilesystemPathType,
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  makeQueryResource,
  renderMimeType,
  renderNode,
  renderSearchResults,
} from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  findTagsSchema,
  makeFindTagsDescription,
  makeFindTagsTool,
} from "@app/lib/actions/mcp_internal_actions/servers/common/find_tags_tool";
import {
  getAgentDataSourceConfigurations,
  makeDataSourceViewFilter,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  checkConflictingTags,
  getCoreSearchArgs,
  shouldAutoGenerateTags,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import { ROOT_PARENT_ID } from "@app/lib/api/data_source_view";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  ContentNodeType,
  CoreAPIContentNode,
  CoreAPIError,
  CoreAPISearchNodesResponse,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";
import {
  CoreAPI,
  DATA_SOURCE_NODE_ID,
  dustManagedCredentials,
  parseTimeFrame,
  removeNulls,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

const FILESYSTEM_TOOL_NAME = "filesystem_navigation";

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
  documentationUrl: null,
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
        "The default order should be kept unless there is a specific reason to change it. " +
        "This parameter is mutually exclusive with the `query` parameter."
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

const SearchToolInputSchema = z.object({
  nodeIds: z
    .array(z.string())
    .describe(
      "Array of exact content node IDs to search within. These are the 'nodeId' values from " +
        "previous search results, which can be folders or files. All children of the designated " +
        "nodes will be searched. If not provided, all available files and folders will be searched."
    )
    .optional(),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
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
});

async function searchCallback(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType | undefined,
  {
    nodeIds,
    dataSources,
    query,
    relativeTimeFrame,
  }: z.infer<typeof SearchToolInputSchema>,
  { tagsIn, tagsNot }: { tagsIn?: string[]; tagsNot?: string[] } = {}
): Promise<Result<CallToolResult, Error>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const credentials = dustManagedCredentials();
  const timeFrame = parseTimeFrame(relativeTimeFrame);

  if (!agentLoopContext?.runContext) {
    throw new Error(
      "agentLoopRunContext is required where the tool is called."
    );
  }

  const { retrievalTopK, citationsOffset } =
    agentLoopContext.runContext.stepContext;

  const agentDataSourceConfigurationsResult =
    await getAgentDataSourceConfigurations(auth, dataSources);

  if (agentDataSourceConfigurationsResult.isErr()) {
    return new Err(
      new Error(agentDataSourceConfigurationsResult.error.message)
    );
  }
  const agentDataSourceConfigurations =
    agentDataSourceConfigurationsResult.value;

  const coreSearchArgsResults = await concurrentExecutor(
    dataSources,
    async (dataSourceConfiguration: DataSourcesToolConfigurationType[number]) =>
      getCoreSearchArgs(auth, dataSourceConfiguration),
    { concurrency: 10 }
  );

  // Set to avoid O(n^2) complexity below.
  const dataSourceIds = new Set<string>(
    removeNulls(
      nodeIds?.map((nodeId: string) => extractDataSourceIdFromNodeId(nodeId)) ??
        []
    )
  );

  const regularNodeIds =
    nodeIds?.filter((nodeId: string) => !isDataSourceNodeId(nodeId)) ?? [];

  const coreSearchArgs = removeNulls(
    coreSearchArgsResults.map((res) => {
      if (!res.isOk() || res.value === null) {
        return null;
      }
      const coreSearchArgs = res.value;

      if (!nodeIds || dataSourceIds.has(coreSearchArgs.dataSourceId)) {
        // If the agent doesn't provide nodeIds, or if it provides the node id
        // of this data source, we keep the default filter.
        return coreSearchArgs;
      }

      // If there are no regular nodes, then we searched for data sources other than the
      // current one; so we don't search this data source.
      if (regularNodeIds.length === 0) {
        return null;
      }

      // If there are regular nodes, we filter to search within these nodes.
      return {
        ...coreSearchArgs,
        filter: {
          ...coreSearchArgs.filter,
          parents: { in: regularNodeIds, not: [] },
        },
      };
    })
  );

  if (coreSearchArgs.length === 0) {
    return new Err(
      new Error("Search action must have at least one data source configured.")
    );
  }

  const conflictingTags = checkConflictingTags(coreSearchArgs, {
    tagsIn,
    tagsNot,
  });
  if (conflictingTags) {
    return new Ok({
      isError: false,
      content: [{ type: "text", text: conflictingTags }],
    });
  }

  const searchResults = await coreAPI.searchDataSources(
    query,
    retrievalTopK,
    credentials,
    false,
    coreSearchArgs.map((args) => {
      // In addition to the tags provided by the user, we add the tags the agent passed.
      const finalTagsIn = [...(args.filter.tags?.in ?? []), ...(tagsIn ?? [])];
      const finalTagsNot = [
        ...(args.filter.tags?.not ?? []),
        ...(tagsNot ?? []),
      ];

      return {
        projectId: args.projectId,
        dataSourceId: args.dataSourceId,
        filter: {
          ...args.filter,
          tags: {
            in: finalTagsIn.length > 0 ? finalTagsIn : null,
            not: finalTagsNot.length > 0 ? finalTagsNot : null,
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
    return new Err(
      new Error(`Failed to search content: ${searchResults.error.message}`)
    );
  }

  if (citationsOffset + retrievalTopK > getRefs().length) {
    return new Err(
      new Error(
        "The search exhausted the total number of references available for citations"
      )
    );
  }

  const refs = getRefs().slice(
    citationsOffset,
    citationsOffset + retrievalTopK
  );

  const results = searchResults.value.documents.map(
    (doc): SearchResultResourceType => {
      const dataSourceView = coreSearchArgs.find(
        (args) =>
          args.dataSourceView.dataSource.dustAPIDataSourceId ===
          doc.data_source_id
      )?.dataSourceView;

      assert(dataSourceView, "DataSource view not found");

      return {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
        uri: doc.source_url ?? "",
        text: `"${getDisplayNameForDocument(doc)}" (${doc.chunks.length} chunks)`,

        id: doc.document_id,
        source: {
          provider: dataSourceView.dataSource.connectorProvider ?? undefined,
        },
        tags: doc.tags,
        ref: refs.shift() as string,
        chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
      };
    }
  );

  const searchNodeIds = searchResults.value.documents.map(
    ({ document_id }) => document_id
  );

  let renderedNodes;
  if (searchNodeIds.length > 0) {
    const searchResult = await coreAPI.searchNodes({
      filter: {
        node_ids: searchNodeIds,
        data_source_views: coreSearchArgs.map((args) => ({
          data_source_id: args.dataSourceId,
          view_filter: args.filter.parents?.in ?? [],
        })),
      },
      options: {
        limit: searchNodeIds.length,
      },
    });

    if (searchResult.isErr()) {
      return new Err(
        new Error(`Failed to search content: ${searchResult.error.message}`)
      );
    }
    renderedNodes = renderSearchResults(
      searchResult.value,
      agentDataSourceConfigurations
    );
  }

  return new Ok({
    isError: false,
    content: [
      {
        type: "resource" as const,
        resource: makeQueryResource({
          query,
          timeFrame,
          tagsIn,
          tagsNot,
          nodeIds,
        }),
      },
      ...(renderedNodes
        ? [{ type: "resource" as const, resource: renderedNodes }]
        : []),
      ...results.map((result) => ({
        type: "resource" as const,
        resource: result,
      })),
    ],
  });
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "cat",
    "Read the contents of a document, referred to by its nodeId (named after the 'cat' unix tool). " +
      "The nodeId can be obtained using the 'find', 'list' or 'search' tools.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      nodeId: z.string().describe("The ID of the node to read."),
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
    },
    withToolLogging(
      auth,
      { toolName: FILESYSTEM_TOOL_NAME, agentLoopContext },
      async ({ dataSources, nodeId, offset, limit, grep }) => {
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

        // Gather data source configurations.
        const fetchResult = await getAgentDataSourceConfigurations(
          auth,
          dataSources
        );

        if (fetchResult.isErr()) {
          return new Err(new Error(fetchResult.error.message));
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
          return new Ok({
            isError: false,
            content: [
              {
                type: "text",
                text: `Could not find node: ${nodeId} (error: ${
                  searchResult.isErr() ? searchResult.error : "No nodes found"
                })`,
              },
            ],
          });
        }

        const node = searchResult.value.nodes[0];

        if (node.node_type !== "document") {
          return new Ok({
            isError: false,
            content: [
              {
                type: "text",
                text: `Node is of type ${node.node_type}, not a document.`,
              },
            ],
          });
        }

        // Get dataSource from the data source configuration.
        const dataSource = agentDataSourceConfigurations.find(
          (config) =>
            config.dataSource.dustAPIDataSourceId === node.data_source_id
        )?.dataSource;

        if (!dataSource) {
          return new Err(
            new Error(`Could not find dataSource for node: ${nodeId}`)
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
            new Error(
              `Could not read node: ${nodeId} (error: ${readResult.error})`
            )
          );
        }

        return new Ok({
          isError: false,
          content: [
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
          ],
        });
      }
    )
  );

  server.tool(
    "find",
    "Find content based on their title starting from a specific node. Can be used to find specific " +
      "nodes by searching for their titles. The query title can be omitted to list all nodes " +
      "starting from a specific node. This is like using 'find' in Unix.",
    {
      query: z
        .string()
        .optional()
        .describe(
          "The title to search for. This supports partial matching and does not require the " +
            "exact title. For example, searching for 'budget' will find 'Budget 2024.xlsx', " +
            "'Q1 Budget Report', etc. This parameter is mutually exclusive with the `sortBy` " +
            "parameter."
        ),
      rootNodeId: z
        .string()
        .optional()
        .describe(
          "The node ID of the node to start the search from. If not provided, the search will " +
            "start from the root of the filesystem. This ID can be found from previous search " +
            "results in the 'nodeId' field. This parameter restricts the search to the children " +
            "and descendant of a specific node. If a node output by this tool or the list tool" +
            "has children (hasChildren: true), it means that it can be passed as a rootNodeId."
        ),
      mimeTypes: z
        .array(z.string())
        .optional()
        .describe(
          "The mime types to search for. If provided, only nodes with one of these mime types " +
            "will be returned. If not provided, no filter will be applied. The mime types passed " +
            "here must be one of the mime types found in the 'mimeType' field."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      ...OPTION_PARAMETERS,
    },
    withToolLogging(
      auth,
      { toolName: FILESYSTEM_TOOL_NAME, agentLoopContext },
      async ({
        query,
        dataSources,
        limit,
        sortBy,
        nextPageCursor,
        rootNodeId,
        mimeTypes,
      }) => {
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

        const fetchResult = await getAgentDataSourceConfigurations(
          auth,
          dataSources
        );

        if (fetchResult.isErr()) {
          return new Err(new Error(fetchResult.error.message));
        }
        const agentDataSourceConfigurations = fetchResult.value;

        const dataSourceNodeId = rootNodeId
          ? extractDataSourceIdFromNodeId(rootNodeId)
          : null;

        // If rootNodeId is provided and is a data source node ID, search only in
        // the data source. If rootNodeId is provided and is a regular node ID,
        // reset all view_filters to this node, so only descendents of this node
        // are searched. It is not straightforward to guess which data source it
        // belongs to, this is why irrelevant data sources are not directly
        // filtered out.
        let viewFilter = makeDataSourceViewFilter(
          agentDataSourceConfigurations
        );

        if (dataSourceNodeId) {
          viewFilter = viewFilter.filter(
            (view) => view.data_source_id === dataSourceNodeId
          );
        } else if (rootNodeId) {
          viewFilter = viewFilter.map((view) => ({
            ...view,
            view_filter: [rootNodeId],
          }));
        }

        const searchResult = await coreAPI.searchNodes({
          query,
          filter: {
            data_source_views: viewFilter,
            mime_types: mimeTypes ? { in: mimeTypes, not: null } : undefined,
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
          return new Err(
            new Error(`Failed to search content: ${searchResult.error.message}`)
          );
        }

        return new Ok({
          isError: false,
          content: [
            {
              type: "resource" as const,
              resource: makeQueryResourceForFind(
                query,
                rootNodeId,
                mimeTypes,
                nextPageCursor
              ),
            },
            {
              type: "resource" as const,
              resource: renderSearchResults(
                searchResult.value,
                agentDataSourceConfigurations
              ),
            },
          ],
        });
      }
    )
  );

  server.tool(
    "list",
    "List the direct contents of a node. Can be used to see what is inside a specific folder from " +
      "the filesystem, like 'ls' in Unix. A good fit is to explore the filesystem structure step " +
      "by step. This tool can be called repeatedly by passing the 'nodeId' output from a step to " +
      "the next step's nodeId. If a node output by this tool or the find tool has children " +
      "(hasChildren: true), it means that this tool can be used again on it.",
    {
      nodeId: z
        .string()
        .nullable()
        .describe(
          "The exact ID of the node to list the contents of. " +
            "This ID can be found from previous search results in the 'nodeId' field. " +
            "If not provided, the content at the root of the filesystem will be shown."
        ),
      mimeTypes: z
        .array(z.string())
        .optional()
        .describe(
          "The mime types to search for. If provided, only nodes with one of these mime types " +
            "will be returned. If not provided, no filter will be applied. The mime types passed " +
            "here must be one of the mime types found in the 'mimeType' field."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      ...OPTION_PARAMETERS,
    },
    withToolLogging(
      auth,
      { toolName: FILESYSTEM_TOOL_NAME, agentLoopContext },
      async ({
        nodeId,
        dataSources,
        limit,
        mimeTypes,
        sortBy,
        nextPageCursor,
      }) => {
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const fetchResult = await getAgentDataSourceConfigurations(
          auth,
          dataSources
        );

        if (fetchResult.isErr()) {
          return new Err(new Error(fetchResult.error.message));
        }
        const agentDataSourceConfigurations = fetchResult.value;

        const options = {
          cursor: nextPageCursor,
          limit,
          sort: sortBy
            ? [{ field: sortBy, direction: getSortDirection(sortBy) }]
            : undefined,
        };

        let searchResult: Result<CoreAPISearchNodesResponse, CoreAPIError>;

        if (!nodeId) {
          // When nodeId is null, search for data sources only
          const dataSourceViewFilter = makeDataSourceViewFilter(
            agentDataSourceConfigurations
          ).map((view) => ({
            ...view,
            search_scope: "data_source_name" as const,
          }));

          searchResult = await coreAPI.searchNodes({
            filter: {
              data_source_views: dataSourceViewFilter,
              mime_types: mimeTypes ? { in: mimeTypes, not: null } : undefined,
            },
            options,
          });
        } else if (isDataSourceNodeId(nodeId)) {
          // If it's a data source node ID, extract the data source ID and list its root contents
          const dataSourceId = extractDataSourceIdFromNodeId(nodeId);
          if (!dataSourceId) {
            return new Err(new Error("Invalid data source node ID format"));
          }

          const dataSourceConfig = agentDataSourceConfigurations.find(
            ({ dataSource }) => dataSource.dustAPIDataSourceId === dataSourceId
          );

          if (!dataSourceConfig) {
            return new Err(
              new Error(`Data source not found for ID: ${dataSourceId}`)
            );
          }

          searchResult = await coreAPI.searchNodes({
            filter: {
              data_source_views: makeDataSourceViewFilter([dataSourceConfig]),
              node_ids: dataSourceConfig.filter.parents?.in ?? undefined,
              parent_id: dataSourceConfig.filter.parents?.in
                ? undefined
                : ROOT_PARENT_ID,
              mime_types: mimeTypes ? { in: mimeTypes, not: null } : undefined,
            },
            options,
          });
        } else {
          // Regular node listing
          const dataSourceViewFilter = makeDataSourceViewFilter(
            agentDataSourceConfigurations
          );

          searchResult = await coreAPI.searchNodes({
            filter: {
              data_source_views: dataSourceViewFilter,
              parent_id: nodeId,
              mime_types: mimeTypes ? { in: mimeTypes, not: null } : undefined,
            },
            options,
          });
        }

        if (searchResult.isErr()) {
          return new Err(new Error("Failed to list folder contents"));
        }

        return new Ok({
          isError: false,
          content: [
            {
              type: "resource" as const,
              resource: makeQueryResourceForList(
                nodeId,
                mimeTypes,
                nextPageCursor
              ),
            },
            {
              type: "resource" as const,
              resource: renderSearchResults(
                searchResult.value,
                agentDataSourceConfigurations
              ),
            },
          ],
        });
      }
    )
  );

  // Check if tags are dynamic before creating the search tool.
  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  if (!areTagsDynamic) {
    server.tool(
      SEARCH_TOOL_NAME,
      "Perform a semantic search within the folders and files designated by `nodeIds`. All " +
        "children of the designated nodes will be searched.",
      SearchToolInputSchema.shape,
      withToolLogging(
        auth,
        { toolName: SEARCH_TOOL_NAME, agentLoopContext },
        async (params) => searchCallback(auth, agentLoopContext, params)
      )
    );
  } else {
    // If tags are dynamic, then we add a tool for the agent to discover tags and let it pass tags
    // in the search tool.
    server.tool(
      "find_tags",
      makeFindTagsDescription(SEARCH_TOOL_NAME),
      findTagsSchema,
      makeFindTagsTool(auth)
    );

    server.tool(
      SEARCH_TOOL_NAME,
      "Perform a semantic search within the folders and files designated by `nodeIds`. All " +
        "children of the designated nodes will be searched.",
      {
        ...SearchToolInputSchema.shape,
        tagsIn: z
          .array(z.string())
          .optional()
          .describe(
            "A list of labels (also called tags) to restrict the search based on the user " +
              "request and past conversation context. If multiple labels are provided, the " +
              "search will return documents that have at least one of the labels. You can't " +
              "check that all labels are present, only that at least one is present. If no labels " +
              "are provided, the search will  return all documents regardless of their labels."
          ),
        tagsNot: z
          .array(z.string())
          .optional()
          .describe(
            "A list of labels (also called tags) to exclude from the search based on the user " +
              "request and past conversation context. Any document having one of these labels " +
              "will be excluded from the search."
          ),
      },
      withToolLogging(
        auth,
        { toolName: SEARCH_TOOL_NAME, agentLoopContext },
        async (params) =>
          searchCallback(auth, agentLoopContext, params, {
            tagsIn: params.tagsIn,
            tagsNot: params.tagsNot,
          })
      )
    );
  }

  server.tool(
    "locate_in_tree",
    "Show the complete path from a node to the data source root, displaying the hierarchy of parent nodes. " +
      "This is useful for understanding where a specific node is located within the data source structure. " +
      "The path is returned as a list of nodes, with the first node being the data source root and " +
      "the last node being the target node.",
    {
      nodeId: z.string().describe("The ID of the node to locate in the tree."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    withToolLogging(
      auth,
      { toolName: FILESYSTEM_TOOL_NAME, agentLoopContext },
      async ({ nodeId, dataSources }) => {
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const fetchResult = await getAgentDataSourceConfigurations(
          auth,
          dataSources
        );

        if (fetchResult.isErr()) {
          return new Err(new Error(fetchResult.error.message));
        }
        const agentDataSourceConfigurations = fetchResult.value;

        if (isDataSourceNodeId(nodeId)) {
          const dataSourceId = extractDataSourceIdFromNodeId(nodeId);
          if (!dataSourceId) {
            return new Err(new Error("Invalid data source node ID format"));
          }

          const dataSourceConfig = agentDataSourceConfigurations.find(
            ({ dataSource }) => dataSource.dustAPIDataSourceId === dataSourceId
          );

          if (!dataSourceConfig) {
            return new Err(
              new Error(`Data source not found for ID: ${dataSourceId}`)
            );
          }

          return new Ok({
            isError: false,
            content: [
              {
                type: "resource" as const,
                resource: {
                  mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILESYSTEM_PATH,
                  uri: "",
                  text: "Node is the data source root.",
                  path: [
                    {
                      nodeId: nodeId,
                      title: dataSourceConfig.dataSource.name,
                      isCurrentNode: true,
                    },
                  ],
                },
              },
            ],
          });
        }

        // Search for the target node.
        const searchResult = await coreAPI.searchNodes({
          filter: {
            node_ids: [nodeId],
            data_source_views: makeDataSourceViewFilter(
              agentDataSourceConfigurations
            ),
          },
        });

        if (searchResult.isErr() || searchResult.value.nodes.length === 0) {
          return new Ok({
            isError: false,
            content: [{ type: "text", text: `Could not find node: ${nodeId}` }],
          });
        }

        const targetNode = searchResult.value.nodes[0];

        const dataSourceRootId = `${DATA_SOURCE_NODE_ID}-${targetNode.data_source_id}`;

        // Build path node IDs excluding the data source root and target node.
        const parentNodeIds = targetNode.parents
          .filter((parentId) => parentId !== nodeId)
          .reverse();

        // Fetch the parent nodes (we already have the target node)
        const pathNodes: Record<string, CoreAPIContentNode> = {};
        if (parentNodeIds.length > 0) {
          const pathSearchResult = await coreAPI.searchNodes({
            filter: {
              node_ids: parentNodeIds,
              data_source_views: makeDataSourceViewFilter(
                agentDataSourceConfigurations
              ),
            },
          });

          if (pathSearchResult.isErr()) {
            return new Err(new Error("Failed to fetch nodes in the path"));
          }

          for (const node of pathSearchResult.value.nodes) {
            pathNodes[node.node_id] = node;
          }
        }

        const dataSourceConfig = agentDataSourceConfigurations.find(
          ({ dataSource }) =>
            dataSource.dustAPIDataSourceId === targetNode.data_source_id
        );

        if (!dataSourceConfig) {
          return new Err(new Error("Could not find data source configuration"));
        }

        // Build the path array.
        const pathItems: FilesystemPathType["path"] = removeNulls([
          // Data source root node
          {
            nodeId: dataSourceRootId,
            title: dataSourceConfig.dataSource.name,
            nodeType: "folder" as ContentNodeType,
            sourceUrl: null,
            isCurrentNode: false,
          },
          // Parent nodes
          ...parentNodeIds.map((parentId) => {
            const node = pathNodes[parentId];
            if (!node) {
              return null;
            }
            return {
              nodeId: parentId,
              title: node.title,
              nodeType: node.node_type,
              sourceUrl: node.source_url,
              isCurrentNode: false,
            };
          }),
          // Target node (always last)
          {
            nodeId: nodeId,
            title: targetNode.title,
            nodeType: targetNode.node_type,
            sourceUrl: targetNode.source_url,
            isCurrentNode: true,
          },
        ]);

        return new Ok({
          isError: false,
          content: [
            {
              type: "resource" as const,
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILESYSTEM_PATH,
                uri: "",
                text: "Path located successfully.",
                path: pathItems,
              },
            },
          ],
        });
      }
    )
  );

  return server;
};

function getSortDirection(field: "title" | "timestamp"): "asc" | "desc" {
  switch (field) {
    case "title":
      return "asc"; // Alphabetical A-Z.
    case "timestamp":
      return "desc"; // Most recent first.
  }
}

/**
 * Check if a node ID represents a data source node.
 * Data source node IDs have the format: "datasource_node_id-{data_source_id}"
 */
function isDataSourceNodeId(nodeId: string): boolean {
  return nodeId.startsWith(`${DATA_SOURCE_NODE_ID}-`);
}

/**
 * Extract the data source ID from a data source node ID.
 * Returns null if the node ID is not a data source node ID.
 */
function extractDataSourceIdFromNodeId(nodeId: string): string | null {
  if (!isDataSourceNodeId(nodeId)) {
    return null;
  }
  return nodeId.substring(`${DATA_SOURCE_NODE_ID}-`.length);
}

export function makeQueryResourceForFind(
  query?: string,
  rootNodeId?: string,
  mimeTypes?: string[],
  nextPageCursor?: string
): SearchQueryResourceType {
  const queryText = query ? ` "${query}"` : " all content";
  const scope = rootNodeId
    ? ` under ${rootNodeId}`
    : " across the entire data sources";
  const types = mimeTypes?.length
    ? ` (${mimeTypes.map(renderMimeType).join(", ")} files)`
    : "";
  const pagination = nextPageCursor ? " - next page" : "";

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text: `Searching for${queryText}${scope}${types}${pagination}.`,
    uri: "",
  };
}

export function makeQueryResourceForList(
  nodeId: string | null,
  mimeTypes?: string[],
  nextPageCursor?: string
): SearchQueryResourceType {
  const location = nodeId ? ` within node "${nodeId}"` : " at the root level";
  const types = mimeTypes?.length
    ? ` (${mimeTypes.map(renderMimeType).join(", ")} files)`
    : "";
  const pagination = nextPageCursor ? " - next page" : "";

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text: `Listing content${location}${types}${pagination}.`,
    uri: "",
  };
}

export default createServer;
