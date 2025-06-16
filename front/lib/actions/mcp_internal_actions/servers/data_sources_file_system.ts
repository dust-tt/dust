import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  DataSourceNodeListType,
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  fetchAgentDataSourceConfiguration,
  getCoreSearchArgs,
  parseDataSourceConfigurationURI,
  renderRelativeTimeFrameForToolOutput,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolRecoverableErrorSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset, getRetrievalTopK } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { ROOT_PARENT_ID } from "@app/lib/api/data_source_view";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import {
  getDataSourceNameFromView,
  getDisplayNameForDocument,
} from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  ConnectorProvider,
  ContentNodeType,
  CoreAPIContentNode,
  CoreAPIError,
  CoreAPISearchNodesResponse,
  Result,
  TimeFrame,
} from "@app/types";
import {
  assertNever,
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
      offset: z
        .number()
        .optional()
        .describe(
          "The character position to start reading from (0-based). If not provided, starts from the beginning."
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
          "A regular expression to filter lines. Applied after offset/limit slicing. Only lines matching this pattern will be returned."
        ),
    },
    async ({ dataSources, nodeId, offset, limit, grep }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      // Gather data source configurations.
      const fetchResult = await getAgentDataSourceConfigurations(
        auth,
        dataSources
      );

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

      // Get dataSource from the data source configuration.
      const dataSource = agentDataSourceConfigurations.find(
        (config) =>
          config.dataSource.dustAPIDataSourceId === node.data_source_id
      )?.dataSource;

      if (!dataSource) {
        return makeMCPToolTextError(
          `Could not find dataSource for node: ${nodeId}`
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
        return makeMCPToolTextError(
          `Could not read node: ${nodeId} (error: ${readResult.error})`
        );
      }

      return {
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
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      const dataSourceNodeId = rootNodeId
        ? extractDataSourceIdFromNodeId(rootNodeId)
        : undefined;

      // If rootNodeId is provided and is a data source node ID, search only in
      // the data source. If rootNodeId is provided and is a regular node ID,
      // reset all view_filters to this node, so only descendents of this node
      // are searched. It is not straightforward to guess which data source it
      // belongs to, this is why irrelevant data sources are not directly
      // filtered out.
      let viewFilter = makeDataSourceViewFilter(agentDataSourceConfigurations);

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
        return makeMCPToolTextError("Failed to search content");
      }

      return {
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
      };
    }
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
        return makeMCPToolTextError(fetchResult.error.message);
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
          return makeMCPToolTextError("Invalid data source node ID format");
        }

        const dataSourceConfig = agentDataSourceConfigurations.find(
          ({ dataSource }) => dataSource.dustAPIDataSourceId === dataSourceId
        );

        if (!dataSourceConfig) {
          return makeMCPToolTextError(
            `Data source not found for ID: ${dataSourceId}`
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
        return makeMCPToolTextError("Failed to list folder contents");
      }

      return {
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
      };
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

      // Set to avoid O(n^2) complexity below.
      const dataSourceIds = new Set<string>(
        removeNulls(
          nodeIds?.map((nodeId) => extractDataSourceIdFromNodeId(nodeId)) ?? []
        )
      );

      const regularNodeIds =
        nodeIds?.filter(
          (nodeId) =>
            !dataSourceIds.has(extractDataSourceIdFromNodeId(nodeId) ?? "")
        ) ?? [];

      const coreSearchArgs = removeNulls(
        coreSearchArgsResults
          .map((res) => (res.isOk() ? res.value : null))
          .map((coreSearchArgs) => {
            if (coreSearchArgs === null) {
              return null;
            }

            if (!nodeIds || dataSourceIds.has(coreSearchArgs.dataSourceId)) {
              // If the agent doesn't provide nodeIds, or if it provides the node id
              // of this data source, we keep the default filter.
              return coreSearchArgs;
            }

            // If there are only data source nodeIds, that are not this one, then
            // this data source can be excluded from the search.
            if (regularNodeIds.length === 0) {
              return null;
            }

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
              provider:
                dataSourceView.dataSource.connectorProvider ?? undefined,
              name: getDataSourceNameFromView(dataSourceView),
            },
            tags: doc.tags,
            ref: refs.shift() as string,
            chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
          };
        }
      );

      return {
        isError: false,
        content: [
          {
            type: "resource" as const,
            resource: makeQueryResource(query, timeFrame),
          },
          ...results.map((result) => ({
            type: "resource" as const,
            resource: result,
          })),
        ],
      };
    }
  );

  server.tool(
    "locate_in_tree",
    "Show the complete path from a node to the data source root, displaying the hierarchy of parent nodes. " +
      "This is useful for understanding where a specific node is located within the data source structure. " +
      "The path is returned as a list of nodes, with the first node being the data source root and the last node being the target node.",
    {
      nodeId: z.string().describe("The ID of the node to locate in the tree."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    async ({ nodeId, dataSources }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const fetchResult = await getAgentDataSourceConfigurations(
        auth,
        dataSources
      );

      if (fetchResult.isErr()) {
        return makeMCPToolTextError(fetchResult.error.message);
      }
      const agentDataSourceConfigurations = fetchResult.value;

      if (isDataSourceNodeId(nodeId)) {
        const dataSourceId = extractDataSourceIdFromNodeId(nodeId);
        if (!dataSourceId) {
          return makeMCPToolTextError("Invalid data source node ID format");
        }

        const dataSourceConfig = agentDataSourceConfigurations.find(
          ({ dataSource }) => dataSource.dustAPIDataSourceId === dataSourceId
        );

        if (!dataSourceConfig) {
          return makeMCPToolTextError(
            `Data source not found for ID: ${dataSourceId}`
          );
        }

        return makeMCPToolJSONSuccess({
          message: "Node is the data source root.",
          result: {
            path: [
              {
                nodeId: nodeId,
                title: dataSourceConfig.dataSource.name,
                isCurrentNode: true,
              },
            ],
          },
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
        return makeMCPToolRecoverableErrorSuccess(
          `Could not find node: ${nodeId}`
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
            data_source_views: makeDataSourceViewFilter(
              agentDataSourceConfigurations
            ),
          },
        });

        if (pathSearchResult.isErr()) {
          return makeMCPToolTextError("Failed to fetch nodes in the path");
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
        return makeMCPToolTextError("Could not find data source configuration");
      }

      // Build the path array.
      const pathItems = removeNulls([
        // Data source root node
        {
          nodeId: dataSourceRootId,
          title: dataSourceConfig.dataSource.name,
          nodeType: "folder" as ContentNodeType,
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
            isCurrentNode: false,
          };
        }),
        // Target node (always last)
        {
          nodeId: nodeId,
          title: targetNode.title,
          nodeType: targetNode.node_type,
          isCurrentNode: true,
        },
      ]);

      return makeMCPToolJSONSuccess({
        message: "Path located successfully.",
        result: {
          path: pathItems,
        },
      });
    }
  );

  return server;
};

// Type to represent data source configuration with resolved data source model
type ResolvedDataSourceConfiguration = DataSourceConfiguration & {
  dataSource: {
    dustAPIProjectId: string;
    dustAPIDataSourceId: string;
    connectorProvider: ConnectorProvider | null;
    name: string;
  };
};

async function getAgentDataSourceConfigurations(
  auth: Authenticator,
  dataSources: DataSourcesToolConfigurationType
): Promise<Result<ResolvedDataSourceConfiguration[], Error>> {
  const configResults = await concurrentExecutor(
    dataSources,
    async (dataSourceConfiguration) => {
      const configInfoRes = parseDataSourceConfigurationURI(
        dataSourceConfiguration.uri
      );

      if (configInfoRes.isErr()) {
        return configInfoRes;
      }

      const configInfo = configInfoRes.value;

      switch (configInfo.type) {
        case "database": {
          // Database configuration
          const r = await fetchAgentDataSourceConfiguration(configInfo.sId);
          if (r.isErr()) {
            return r;
          }
          const agentConfig = r.value;
          const dataSourceViewSId = DataSourceViewResource.modelIdToSId({
            id: agentConfig.dataSourceView.id,
            workspaceId: agentConfig.dataSourceView.workspaceId,
          });
          const resolved: ResolvedDataSourceConfiguration = {
            workspaceId: agentConfig.dataSourceView.workspace.sId,
            dataSourceViewId: dataSourceViewSId,
            filter: {
              parents:
                agentConfig.parentsIn || agentConfig.parentsNotIn
                  ? {
                      in: agentConfig.parentsIn || [],
                      not: agentConfig.parentsNotIn || [],
                    }
                  : null,
              tags:
                agentConfig.tagsIn || agentConfig.tagsNotIn
                  ? {
                      in: agentConfig.tagsIn || [],
                      not: agentConfig.tagsNotIn || [],
                      mode: agentConfig.tagsMode || "custom",
                    }
                  : undefined,
            },
            dataSource: {
              dustAPIProjectId: agentConfig.dataSource.dustAPIProjectId,
              dustAPIDataSourceId: agentConfig.dataSource.dustAPIDataSourceId,
              connectorProvider: agentConfig.dataSource.connectorProvider,
              name: agentConfig.dataSource.name,
            },
          };
          return new Ok(resolved);
        }

        case "dynamic": {
          // Dynamic configuration
          // Verify the workspace ID matches the auth
          if (
            configInfo.configuration.workspaceId !==
            auth.getNonNullableWorkspace().sId
          ) {
            return new Err(
              new Error(
                `Workspace mismatch: configuration workspace ${configInfo.configuration.workspaceId} does not match authenticated workspace`
              )
            );
          }

          // Fetch the specific data source view by ID
          const dataSourceView = await DataSourceViewResource.fetchById(
            auth,
            configInfo.configuration.dataSourceViewId
          );

          if (!dataSourceView) {
            return new Err(
              new Error(
                `Data source view not found: ${configInfo.configuration.dataSourceViewId}`
              )
            );
          }

          const dataSource = dataSourceView.dataSource;

          const resolved: ResolvedDataSourceConfiguration = {
            ...configInfo.configuration,
            dataSource: {
              dustAPIProjectId: dataSource.dustAPIProjectId,
              dustAPIDataSourceId: dataSource.dustAPIDataSourceId,
              connectorProvider: dataSource.connectorProvider,
              name: dataSource.name,
            },
          };
          return new Ok(resolved);
        }

        default:
          assertNever(configInfo);
      }
    },
    { concurrency: 10 }
  );

  if (configResults.some((res) => res.isErr())) {
    return new Err(new Error("Failed to fetch data source configurations."));
  }

  return new Ok(
    removeNulls(configResults.map((res) => (res.isOk() ? res.value : null)))
  );
}

function makeDataSourceViewFilter(
  agentDataSourceConfigurations: ResolvedDataSourceConfiguration[]
) {
  return agentDataSourceConfigurations.map(({ dataSource, filter }) => ({
    data_source_id: dataSource.dustAPIDataSourceId,
    view_filter: filter.parents?.in ?? [],
  }));
}

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
function renderNode(
  node: CoreAPIContentNode,
  dataSourceIdToConnectorMap: Map<string, ConnectorProvider | null>
) {
  // Transform data source node IDs to include the data source ID
  const nodeId =
    node.node_id === DATA_SOURCE_NODE_ID
      ? `${DATA_SOURCE_NODE_ID}-${node.data_source_id}`
      : node.node_id;

  return {
    nodeId,
    title: node.title,
    path: node.parents.join("/"),
    parentTitle: node.parent_title,
    lastUpdatedAt: formatTimestamp(node.timestamp),
    sourceUrl: node.source_url,
    // TODO(2025-06-02 aubin): see if we want a translation on these.
    mimeType: node.mime_type,
    hasChildren: node.children_count > 0,
    connectorProvider:
      dataSourceIdToConnectorMap.get(node.data_source_id) ?? null,
  };
}

/**
 * Translation from core's response to the format expected to the agent.
 * Removes references to the term 'content node' and simplifies the format.
 */
function renderSearchResults(
  response: CoreAPISearchNodesResponse,
  agentDataSourceConfigurations: ResolvedDataSourceConfiguration[]
): DataSourceNodeListType {
  const dataSourceIdToConnectorMap = new Map<
    string,
    ConnectorProvider | null
  >();
  for (const config of agentDataSourceConfigurations) {
    dataSourceIdToConnectorMap.set(
      config.dataSource.dustAPIDataSourceId,
      config.dataSource.connectorProvider
    );
  }

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_LIST,
    text: "Content successfully retrieved.",
    uri: "",
    data: response.nodes.map((node) =>
      renderNode(node, dataSourceIdToConnectorMap)
    ),
    nextPageCursor: response.next_page_cursor,
    resultCount: response.hit_count,
  };
}

function makeQueryResource(
  query: string,
  relativeTimeFrame: TimeFrame | null
): SearchQueryResourceType {
  const timeFrameAsString =
    renderRelativeTimeFrameForToolOutput(relativeTimeFrame);

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text: query
      ? `Searching "${query}", ${timeFrameAsString}.`
      : `Searching ${timeFrameAsString}.`,
    uri: "",
  };
}

function renderMimeType(mimeType: string) {
  return mimeType
    .replace("application/vnd.dust.", "")
    .replace("-", " ")
    .replace(".", " ");
}

function makeQueryResourceForFind(
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

function makeQueryResourceForList(
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
