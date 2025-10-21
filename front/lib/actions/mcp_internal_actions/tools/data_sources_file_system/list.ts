import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { FILESYSTEM_LIST_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { renderSearchResults } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  extractDataSourceIdFromNodeId,
  isDataSourceNodeId,
  makeQueryResourceForList,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/utils";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
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

const ListToolInputSchema = {
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
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  sortBy: z
    .enum(["title", "timestamp"])
    .optional()
    .describe(
      "Field to sort the results by. 'title' sorts alphabetically A-Z, 'timestamp' sorts by " +
        "most recent first. If not specified, results are returned in the default order, which is " +
        "folders first, then both documents and tables and alphabetically by title."
    ),
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
};

export function registerListTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined,
  { name, extraDescription }: { name: string; extraDescription?: string }
) {
  const baseDescription =
    "List the direct contents of a node. Can be used to see what is inside a specific folder from " +
    "the filesystem, like 'ls' in Unix. A good fit is to explore the filesystem structure step " +
    "by step. This tool can be called repeatedly by passing the 'nodeId' output from a step to " +
    "the next step's nodeId. If a node output by this tool or the find tool has children " +
    "(hasChildren: true), it means that this tool can be used again on it.";
  const toolDescription = extraDescription
    ? baseDescription + " " + extraDescription
    : baseDescription;

  server.tool(
    name,
    toolDescription,
    ListToolInputSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FILESYSTEM_LIST_TOOL_NAME,
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

        if (!nodeId) {
          // When nodeId is null, search for data sources only.
          const dataSourceViewFilter = makeCoreSearchNodesFilters(
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
              new MCPError(`Data source not found for ID: ${dataSourceId}`)
            );
          }

          searchResult = await coreAPI.searchNodes({
            filter: {
              data_source_views: makeCoreSearchNodesFilters([dataSourceConfig]),
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
          const dataSourceViewFilter = makeCoreSearchNodesFilters(
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
          return new Err(
            new MCPError(
              `Failed to list folder contents: ${searchResult.error.message}`
            )
          );
        }

        return new Ok([
          {
            type: "resource",
            resource: makeQueryResourceForList(
              nodeId,
              mimeTypes,
              nextPageCursor
            ),
          },
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
