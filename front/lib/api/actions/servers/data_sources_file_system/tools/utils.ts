import { DATA_SOURCE_NODE_ID } from "@app/types";

export const NO_DATA_SOURCE_AVAILABLE_ERROR =
  "No data source is available in the current scope. There is no data to " +
  "search or browse. Retrying will not do anything.";

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
