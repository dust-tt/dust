import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import type {
  DataSourceNodeListType,
  SearchQueryResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ResolvedDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type {
  ConnectorProvider,
  CoreAPIContentNode,
  CoreAPISearchNodesResponse,
  TimeFrame,
} from "@app/types";
import { DATA_SOURCE_NODE_ID } from "@app/types";

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
export function renderNode(
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
export function renderSearchResults(
  response: CoreAPISearchNodesResponse,
  agentDataSourceConfigurations: ResolvedDataSourceConfiguration[]
): DataSourceNodeListType {
  const dataSourceIdToConnectorMap = new Map<
    string,
    ConnectorProvider | null
  >();
  for (const {
    dataSource: { dustAPIDataSourceId, connectorProvider },
  } of agentDataSourceConfigurations) {
    dataSourceIdToConnectorMap.set(dustAPIDataSourceId, connectorProvider);
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

export function renderMimeType(mimeType: string) {
  return mimeType
    .replace("application/vnd.dust.", "")
    .replace("-", " ")
    .replace(".", " ");
}

export function renderRelativeTimeFrameForToolOutput(
  relativeTimeFrame: TimeFrame | null
): string {
  return relativeTimeFrame
    ? "over the last " +
        (relativeTimeFrame.duration > 1
          ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
          : `${relativeTimeFrame.unit}`)
    : "across all time periods";
}

export function renderTagsForToolOutput(
  tagsIn?: string[],
  tagsNot?: string[]
): string {
  const tagsInAsString =
    tagsIn && tagsIn.length > 0 ? `, with labels ${tagsIn?.join(", ")}` : "";
  const tagsNotAsString =
    tagsNot && tagsNot.length > 0
      ? `, excluding labels ${tagsNot?.join(", ")}`
      : "";
  return `${tagsInAsString}${tagsNotAsString}`;
}

function renderSearchNodeIds(nodeIds?: string[]): string {
  return nodeIds && nodeIds.length > 0
    ? `within ${nodeIds.length} different subtrees `
    : "";
}

export function makeQueryResource({
  query,
  timeFrame,
  tagsIn,
  tagsNot,
  nodeIds,
}: {
  query: string;
  timeFrame: TimeFrame | null;
  tagsIn?: string[];
  tagsNot?: string[];
  nodeIds?: string[];
}): SearchQueryResourceType {
  const timeFrameAsString = renderRelativeTimeFrameForToolOutput(timeFrame);
  const tagsAsString = renderTagsForToolOutput(tagsIn, tagsNot);
  const nodeIdsAsString = renderSearchNodeIds(nodeIds);

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text: query
      ? `Searching "${query}" ${nodeIdsAsString}${timeFrameAsString}${tagsAsString}.`
      : `Searching ${timeFrameAsString}${tagsAsString}.`,
    uri: "",
  };
}
