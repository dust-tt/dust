import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

import type { SearchQueryResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderMimeType } from "@app/lib/actions/mcp_internal_actions/rendering";
import { DATA_SOURCE_NODE_ID } from "@app/types";

export const DATA_SOURCE_FILE_SYSTEM_OPTION_PARAMETERS = {
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

export function getSearchNodesSortDirection(
  field: "title" | "timestamp"
): "asc" | "desc" {
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
export function isDataSourceNodeId(nodeId: string): boolean {
  return nodeId.startsWith(`${DATA_SOURCE_NODE_ID}-`);
}

/**
 * Extract the data source ID from a data source node ID.
 * Returns null if the node ID is not a data source node ID.
 */
export function extractDataSourceIdFromNodeId(nodeId: string): string | null {
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
