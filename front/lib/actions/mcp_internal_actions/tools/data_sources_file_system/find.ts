import { isDustMimeType } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { FILESYSTEM_FIND_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { renderSearchResults } from "@app/lib/actions/mcp_internal_actions/rendering";
import { extractDataSourceIdFromNodeId } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/utils";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type {
  DataSourceFilesystemFindInputType,
  TagsInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import {
  DataSourceFilesystemFindInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { CoreAPI, Err, Ok } from "@app/types";

export function registerFindTool(
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
    "Find content based on their title starting from a specific node. Can be used to find specific " +
    "nodes by searching for their titles. The query title can be omitted to list all nodes " +
    "starting from a specific node. This is like using 'find' in Unix.";
  const toolDescription = extraDescription
    ? baseDescription + "\n" + extraDescription
    : baseDescription;

  if (areTagsDynamic) {
    server.tool(
      name,
      toolDescription,
      {
        ...DataSourceFilesystemFindInputSchema.shape,
        ...TagsInputSchema.shape,
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: FILESYSTEM_FIND_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) => findCallback(auth, params)
      )
    );
  } else {
    server.tool(
      name,
      toolDescription,
      DataSourceFilesystemFindInputSchema.shape,
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: FILESYSTEM_FIND_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) => findCallback(auth, params)
      )
    );
  }
}

async function findCallback(
  auth: Authenticator,
  {
    query,
    dataSources,
    limit,
    nextPageCursor,
    rootNodeId,
    mimeTypes,
    tagsIn,
    tagsNot,
  }: DataSourceFilesystemFindInputType & TagsInputType
): Promise<Result<CallToolResult["content"], MCPError>> {
  const invalidMimeTypes = mimeTypes?.filter((m) => !isDustMimeType(m));
  if (invalidMimeTypes && invalidMimeTypes.length > 0) {
    return new Err(
      new MCPError(`Invalid mime types: ${invalidMimeTypes.join(", ")}`, {
        tracked: false,
      })
    );
  }

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
  let viewFilter = makeCoreSearchNodesFilters({
    agentDataSourceConfigurations,
    additionalDynamicTags: { tagsIn, tagsNot },
  });

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
      resource: renderSearchResults(
        searchResult.value,
        agentDataSourceConfigurations
      ),
    },
  ]);
}
