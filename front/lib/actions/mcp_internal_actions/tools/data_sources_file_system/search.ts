import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { SEARCH_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderSearchResults } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  extractDataSourceIdFromNodeId,
  isDataSourceNodeId,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/utils";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  getAgentDataSourceConfigurations,
  getCoreSearchArgs,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type {
  SearchWithNodesInputType,
  TagsInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import {
  SearchWithNodesInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
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

export function registerSearchTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined,
  {
    name,
    extraDescription,
    areTagsDynamic,
  }: { name: string; extraDescription?: string; areTagsDynamic?: boolean }
) {
  const baseDescription =
    "Perform a semantic search within the folders and files designated by `nodeIds`. All " +
    "children of the designated nodes will be searched.";
  const toolDescription = extraDescription
    ? baseDescription + "\n" + extraDescription
    : baseDescription;

  if (areTagsDynamic) {
    server.tool(
      name,
      toolDescription,
      {
        ...SearchWithNodesInputSchema.shape,
        ...TagsInputSchema.shape,
      },
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
    server.tool(
      name,
      toolDescription,
      SearchWithNodesInputSchema.shape,
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
  }
}

async function searchCallback(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType | undefined,
  {
    nodeIds,
    dataSources,
    query,
    relativeTimeFrame,
    tagsIn,
    tagsNot,
  }: SearchWithNodesInputType & TagsInputType
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

  const conflictingTags = checkConflictingTags(
    coreSearchArgs.map(({ filter }) => filter.tags),
    { tagsIn, tagsNot }
  );
  if (conflictingTags) {
    return new Err(new MCPError(conflictingTags, { tracked: false }));
  }

  const searchResults = await coreAPI.bulkSearchDataSources(
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
        data_source_views: makeCoreSearchNodesFilters({
          agentDataSourceConfigurations,
          additionalDynamicTags: { tagsIn, tagsNot },
        }),
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
    ...(renderedNodes
      ? [{ type: "resource" as const, resource: renderedNodes }]
      : []),
    ...results.map((result) => ({
      type: "resource" as const,
      resource: result,
    })),
  ]);
}
