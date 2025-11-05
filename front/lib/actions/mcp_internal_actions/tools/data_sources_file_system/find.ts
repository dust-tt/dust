import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { renderSearchResults } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  extractDataSourceIdFromNodeId,
  makeQueryResourceForFind,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/utils";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { DataSourceFilesystemFindInputType } from "@app/lib/actions/mcp_internal_actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { CoreAPI, Err, Ok } from "@app/types";

export async function findCallback(
  auth: Authenticator,
  {
    query,
    dataSources,
    limit,
    nextPageCursor,
    rootNodeId,
    mimeTypes,
  }: DataSourceFilesystemFindInputType,
  { tagsIn, tagsNot }: { tagsIn?: string[]; tagsNot?: string[] } = {}
): Promise<Result<CallToolResult["content"], MCPError>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const fetchResult = await getAgentDataSourceConfigurations(auth, dataSources);

  if (fetchResult.isErr()) {
    return new Err(new MCPError(fetchResult.error.message));
  }
  const agentDataSourceConfigurations = fetchResult.value;

  const conflictingTags = checkConflictingTags(
    agentDataSourceConfigurations.map(({ filter }) => filter.tags),
    { tagsIn, tagsNot }
  );
  if (conflictingTags) {
    return new Err(new MCPError(conflictingTags, { tracked: false }));
  }

  const dataSourceNodeId = rootNodeId
    ? extractDataSourceIdFromNodeId(rootNodeId)
    : null;

  // If rootNodeId is provided and is a data source node ID, search only in
  // the data source. If rootNodeId is provided and is a regular node ID,
  // add this node to all filters so that only descendents of this node
  // are searched. It is not straightforward to guess which data source it
  // belongs to, this is why irrelevant data sources are not directly
  // filtered out.
  let viewFilter = makeCoreSearchNodesFilters(
    agentDataSourceConfigurations,
    { tagsIn, tagsNot },
    { useTagFilters: true }
  );

  if (dataSourceNodeId) {
    viewFilter = viewFilter.filter(
      (view) => view.data_source_id === dataSourceNodeId
    );
  } else if (rootNodeId) {
    // Checking that we do have access to the root node.
    const rootNodeSearchResult = await coreAPI.searchNodes({
      filter: {
        data_source_views: viewFilter,
        node_ids: [rootNodeId],
      },
    });
    if (rootNodeSearchResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to search content: ${rootNodeSearchResult.error.message}`
        )
      );
    }
    // If we could not access the root node, we return an error early here.
    if (
      rootNodeSearchResult.value.nodes.length === 0 ||
      rootNodeSearchResult.value.nodes[0].node_id !== rootNodeId
    ) {
      return new Err(
        new MCPError(`Could not find node: ${rootNodeId}`, {
          tracked: false,
        })
      );
    }

    viewFilter = viewFilter.map((view) => ({
      ...view,
      filter: [rootNodeId],
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
      new MCPError(`Failed to search content: ${searchResult.error.message}`)
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
