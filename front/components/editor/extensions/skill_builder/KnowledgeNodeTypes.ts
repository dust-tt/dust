// Pure types and helpers for the knowledge node — kept React-free so the
// schema-only KnowledgeNode extension and any server-side TipTap pipeline
// can import them without dragging in the React NodeView chain.
import { KNOWLEDGE_TAG } from "@app/lib/editor/knowledge_node_constants";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";

// Minimal data from serialization.
export interface BaseKnowledgeItem {
  dataSourceViewId: string;
  hasChildren: boolean;
  label: string;
  nodeId: string;
  spaceId: string;
}

// Fresh selection from search with complete node data.
export interface FullKnowledgeItem extends BaseKnowledgeItem {
  node: DataSourceViewContentNode;
}

export type KnowledgeItem = BaseKnowledgeItem | FullKnowledgeItem;

export function getKnowledgeItems(attrs: {
  selectedItems?: unknown;
}): KnowledgeItem[] {
  return Array.isArray(attrs.selectedItems) ? attrs.selectedItems : [];
}

// `selectedItems` is an array in the schema, but every insertion
// writes exactly one item, so a knowledge node holds at most one
export function getFirstKnowledgeItem(attrs: {
  selectedItems?: unknown;
}): KnowledgeItem | undefined {
  return getKnowledgeItems(attrs)[0];
}

export function isFullKnowledgeItem(
  item: KnowledgeItem
): item is FullKnowledgeItem {
  return "node" in item && item.node !== undefined;
}

/**
 * Computes whether a node has children, with special handling for Notion.
 * For Notion: pages and databases can have children even if they're currently empty.
 * For others: uses expandable field or node type.
 */
export function computeHasChildren(node: DataSourceViewContentNode): boolean {
  const isNotion =
    node.dataSourceView.dataSource.connectorProvider === "notion";

  if (isNotion) {
    // In Notion, pages (documents) and databases (tables) can have children.
    // Folders always can have children (though Notion doesn't actually use folders).
    return (
      node.type === "folder" ||
      node.type === "document" ||
      node.type === "table"
    );
  }

  // For non-Notion sources, use the childrenCount field.
  return node.childrenCount > 0;
}

// Serializes the essential data for model understanding and API fetching.
// IMPORTANT: the format (especially hasChildren) is designed to match the
// output of renderNode() in lib/actions/mcp_internal_actions/rendering.ts so
// agents see a consistent structure between knowledge attached in
// instructions/messages and tool outputs from the data_sources_file_system
// server. If you change this format, review renderNode() and vice versa.
export function serializeKnowledgeTag(item: KnowledgeItem): string {
  // Compute hasChildren with special logic for Notion if we have full node data.
  const hasChildren = isFullKnowledgeItem(item)
    ? computeHasChildren(item.node)
    : item.hasChildren;

  return `<${KNOWLEDGE_TAG} id="${item.nodeId}" title="${item.label}" space="${item.spaceId}" dsv="${item.dataSourceViewId}" hasChildren="${hasChildren}" />`;
}

export function knowledgeNodeToItem(node: DataSourceViewContentNode) {
  return {
    dataSourceViewId: node.dataSourceView.sId,
    hasChildren: computeHasChildren(node),
    label: node.title,
    node,
    nodeId: node.internalId,
    spaceId: node.dataSourceView.spaceId,
  };
}
