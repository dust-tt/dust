import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { renderSearchResults } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  extractDataSourceIdFromNodeId,
  isDataSourceNodeId,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/utils";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { DataSourceFilesystemListInputSchema } from "@app/lib/actions/mcp_internal_actions/types";
import { ensureAuthorizedDataSourceViews } from "@app/lib/actions/mcp_internal_actions/utils/data_source_views";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import { ROOT_PARENT_ID } from "@app/lib/api/data_source_view";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type {
  CoreAPIError,
  CoreAPISearchNodesResponse,
  Result,
} from "@app/types";
import { CoreAPI, Err, Ok } from "@app/types";

export function registerListTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined,
  { name, extraDescription }: { name: string; extraDescription?: string }
) {
  const baseDescription =
    "List the direct contents of a node, like 'ls' in Unix. Should only be used on nodes with children " +
    "(hasChildren: true). A good fit is to explore the filesystem structure step " +
    "by step. This tool can be called repeatedly by passing the 'nodeId' output from a step to " +
    "the next step's nodeId. If a node output by this tool or the find tool has children " +
    "(hasChildren: true), it means that this tool can be used again on it.";
  const toolDescription = extraDescription
    ? baseDescription + "\n" + extraDescription
    : baseDescription;

  server.tool(
    name,
    toolDescription,
    DataSourceFilesystemListInputSchema.shape,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: name,
        agentLoopContext,
        enableAlerting: true,
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
          return new Err(new MCPError(fetchResult.error.message));
        }
        const agentDataSourceConfigurations = fetchResult.value;

        const authRes = await ensureAuthorizedDataSourceViews(
          auth,
          agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
        );
        if (authRes.isErr()) {
          return new Err(authRes.error);
        }

        const options = {
          cursor: nextPageCursor,
          limit,
          sort: sortBy
            ? [
                {
                  field: sortBy,
                  direction: getSearchNodesSortDirection(sortBy),
                },
              ]
            : undefined,
        };

        let searchResult: Result<CoreAPISearchNodesResponse, CoreAPIError>;

        // By-pass tag filters when exploring the filesystem hierarchy
        const includeTagFilters = false;

        if (!nodeId) {
          // When nodeId is null, search for data sources only.
          const dataSourceViewFilter = makeCoreSearchNodesFilters({
            agentDataSourceConfigurations,
            includeTagFilters,
          }).map((view) => ({
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
          // If it's a data source node ID, extract the data source ID and list its root contents.
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

          searchResult = await coreAPI.searchNodes({
            filter: {
              data_source_views: makeCoreSearchNodesFilters({
                agentDataSourceConfigurations: [dataSourceConfig],
                includeTagFilters,
              }),
              node_ids: dataSourceConfig.filter.parents?.in ?? undefined,
              parent_id: dataSourceConfig.filter.parents?.in
                ? undefined
                : ROOT_PARENT_ID,
              mime_types: mimeTypes ? { in: mimeTypes, not: null } : undefined,
            },
            options,
          });
        } else {
          // Regular node listing.
          searchResult = await coreAPI.searchNodes({
            filter: {
              data_source_views: makeCoreSearchNodesFilters({
                agentDataSourceConfigurations,
                includeTagFilters,
              }),
              parent_id: nodeId,
              mime_types: mimeTypes ? { in: mimeTypes, not: null } : undefined,
            },
            options,
          });
        }

        if (searchResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to list node contents: ${searchResult.error.message}`
            )
          );
        }

        return new Ok([
          {
            type: "resource",
            resource: renderSearchResults(
              searchResult.value,
              agentDataSourceConfigurations
            ),
          },
        ]);
      }
    )
  );
}

function getSearchNodesSortDirection(
  field: "title" | "timestamp"
): "asc" | "desc" {
  switch (field) {
    case "title":
      return "asc"; // Alphabetical A-Z.

    case "timestamp":
      return "desc"; // Most recent first.
  }
}
