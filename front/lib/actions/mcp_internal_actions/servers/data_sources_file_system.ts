import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  FIND_TAGS_TOOL_NAME,
  SEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  FilesystemPathType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  makeQueryResource,
  renderSearchResults,
} from "@app/lib/actions/mcp_internal_actions/rendering";
import { registerCatTool } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/cat";
import { registerListTool } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/list";
import {
  extractDataSourceIdFromNodeId,
  isDataSourceNodeId,
  makeQueryResourceForFind,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/utils";
import { registerFindTagsTool } from "@app/lib/actions/mcp_internal_actions/tools/tags/find_tags";
import {
  checkConflictingTags,
  shouldAutoGenerateTags,
} from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  getAgentDataSourceConfigurations,
  getCoreSearchArgs,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ContentNodeType, CoreAPIContentNode, Result } from "@app/types";
import {
  CoreAPI,
  DATA_SOURCE_NODE_ID,
  dustManagedCredentials,
  Err,
  Ok,
  parseTimeFrame,
  removeNulls,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

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
): Promise<Result<CallToolResult["content"], MCPError>> {
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
      new MCPError(agentDataSourceConfigurationsResult.error.message)
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

  if (coreSearchArgsResults.some((res) => res.isErr())) {
    return new Err(
      new MCPError(
        "Invalid data sources: " +
          removeNulls(
            coreSearchArgsResults.map((res) => (res.isErr() ? res.error : null))
          )
            .map((error) => error.message)
            .join("\n")
      )
    );
  }

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
      new MCPError(
        "Search action must have at least one data source configured.",
        {
          tracked: false,
        }
      )
    );
  }

  const conflictingTags = checkConflictingTags(coreSearchArgs, {
    tagsIn,
    tagsNot,
  });
  if (conflictingTags) {
    return new Err(new MCPError(conflictingTags, { tracked: false }));
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
      new MCPError(`Failed to search content: ${searchResults.error.message}`)
    );
  }

  if (citationsOffset + retrievalTopK > getRefs().length) {
    return new Err(
      new MCPError(
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
        data_source_views: makeCoreSearchNodesFilters(
          agentDataSourceConfigurations
        ),
      },
      options: {
        limit: searchNodeIds.length,
      },
    });

    if (searchResult.isErr()) {
      return new Err(
        new MCPError(`Failed to search content: ${searchResult.error.message}`)
      );
    }
    renderedNodes = renderSearchResults(
      searchResult.value,
      agentDataSourceConfigurations
    );
  }

  return new Ok([
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
  ]);
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("data_sources_file_system");

  registerCatTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_CAT_TOOL_NAME,
  });

  server.tool(
    FILESYSTEM_FIND_TOOL_NAME,
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
            "'Q1 Budget Report', etc..."
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
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of results to return. Initial searches should use 10-20."
        ),
      nextPageCursor: z
        .string()
        .optional()
        .describe(
          "Cursor for fetching the next page of results. This parameter should only be used to fetch " +
            "the next page of a previous search. The value should be exactly the 'nextPageCursor' from " +
            "the previous search result."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FILESYSTEM_FIND_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({
        query,
        dataSources,
        limit,
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
          return new Err(new MCPError(fetchResult.error.message));
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
        let viewFilter = makeCoreSearchNodesFilters(
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
          },
        });

        if (searchResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to search content: ${searchResult.error.message}`
            )
          );
        }

        return new Ok([
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
        ]);
      }
    )
  );

  registerListTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_LIST_TOOL_NAME,
  });

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
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) => searchCallback(auth, agentLoopContext, params)
      )
    );
  } else {
    // If tags are dynamic, then we add a tool for the agent to discover tags and let it pass tags
    // in the search tool.
    registerFindTagsTool(auth, server, agentLoopContext, {
      name: FIND_TAGS_TOOL_NAME,
      extraDescription: `This tool is meant to be used before the ${SEARCH_TOOL_NAME} tool.`,
    });

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
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) =>
          searchCallback(auth, agentLoopContext, params, {
            tagsIn: params.tagsIn,
            tagsNot: params.tagsNot,
          })
      )
    );
  }

  server.tool(
    FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
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
      {
        toolNameForMonitoring: FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ nodeId, dataSources }) => {
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const fetchResult = await getAgentDataSourceConfigurations(
          auth,
          dataSources
        );

        if (fetchResult.isErr()) {
          return new Err(new MCPError(fetchResult.error.message));
        }
        const agentDataSourceConfigurations = fetchResult.value;

        if (isDataSourceNodeId(nodeId)) {
          const dataSourceId = extractDataSourceIdFromNodeId(nodeId);
          if (!dataSourceId) {
            return new Err(
              new MCPError("Invalid data source node ID format", {
                tracked: false,
              })
            );
          }

          const dataSourceConfig = agentDataSourceConfigurations.find(
            ({ dataSource }) => dataSource.dustAPIDataSourceId === dataSourceId
          );

          if (!dataSourceConfig) {
            return new Err(
              new MCPError(`Data source not found for ID: ${dataSourceId}`, {
                tracked: false,
              })
            );
          }

          return new Ok([
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
          ]);
        }

        // Search for the target node.
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
            new MCPError(`Could not find node: ${nodeId}`, { tracked: false })
          );
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
              data_source_views: makeCoreSearchNodesFilters(
                agentDataSourceConfigurations
              ),
            },
          });

          if (pathSearchResult.isErr()) {
            return new Err(new MCPError("Failed to fetch nodes in the path"));
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
          return new Err(
            new MCPError("Could not find data source configuration")
          );
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

        return new Ok([
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILESYSTEM_PATH,
              uri: "",
              text: "Path located successfully.",
              path: pathItems,
            },
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
