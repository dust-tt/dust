import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { KnowledgeNodeView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
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

export interface KnowledgeNodeAttributes {
  selectedItems: KnowledgeItem[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    knowledgeNode: {
      insertKnowledgeNode: () => ReturnType;
    };
  }
}

export const KNOWLEDGE_NODE_TYPE = "knowledgeNode";

export const KnowledgeNode = Node.create<{}>({
  name: KNOWLEDGE_NODE_TYPE,

  group: "inline",
  inline: true,
  atom: false, // Make it editable.
  selectable: false, // Allow text cursor inside.

  markdownTokenizer: {
    name: "knowledgeNode",
    level: "inline",
    start: (src) => {
      return src.indexOf("<knowledge");
    },
    tokenize: (src) => {
      const match = /^<knowledge\s+([^>]+)\s*\/>/.exec(src);
      if (!match) {
        return undefined;
      }

      const attributesString = match[1];
      const dsvMatch = attributesString.match(/dsv="([^"]*)"/);
      const hasChildrenMatch = attributesString.match(/hasChildren="([^"]*)"/);
      const idMatch = attributesString.match(/id="([^"]+)"/);
      const spaceMatch = attributesString.match(/space="([^"]*)"/);
      const titleMatch = attributesString.match(/title="([^"]+)"/);

      if (!idMatch || !titleMatch) {
        return undefined;
      }

      const token = {
        type: "knowledgeNode",
        dataSourceViewId: dsvMatch ? dsvMatch[1] : undefined,
        hasChildren: hasChildrenMatch ? hasChildrenMatch[1] === "true" : false,
        knowledgeId: idMatch[1],
        knowledgeTitle: titleMatch[1],
        raw: match[0],
        spaceId: spaceMatch ? spaceMatch[1] : undefined,
      };

      return token;
    },
  },

  addAttributes() {
    return {
      selectedItems: {
        default: [],
        parseHTML: (element) => {
          const data = element.getAttribute("data-selected-items");
          return data ? JSON.parse(data) : [];
        },
        renderHTML: (attributes) => ({
          "data-selected-items": JSON.stringify(attributes.selectedItems),
        }),
      },
    };
  },

  // HTML serialization and deserialization.

  parseHTML() {
    return [
      {
        tag: 'span[data-type="knowledge-node"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { selectedItems } = node.attrs;

    if (selectedItems.length > 0) {
      // Render selected knowledge as semantic HTML with full data preservation
      return [
        "span",
        mergeAttributes(
          {
            "data-type": "knowledge-node",
            "data-knowledge-id": selectedItems[0].id,
            "data-knowledge-label": selectedItems[0].label,
            "data-knowledge-description": selectedItems[0].description ?? "",
          },
          HTMLAttributes
        ),
        selectedItems[0].label,
      ];
    }

    // For search state, render as empty placeholder (shouldn't normally be serialized)
    return [
      "span",
      mergeAttributes(
        {
          "data-type": "knowledge-node",
          "data-is-searching": "true",
        },
        HTMLAttributes
      ),
      "[Knowledge search]",
    ];
  },

  // Markdown serialization and deserialization.
  //
  // IMPORTANT: The serialization format (especially hasChildren) is designed to match
  // the output of renderNode() in lib/actions/mcp_internal_actions/rendering.ts.
  // This ensures agents see consistent data structure between:
  // - Knowledge attached in instructions (serialized here)
  // - Tool outputs from data_sources_file_system server (rendered by renderNode)
  // If you change this format, review renderNode() and vice versa.

  renderMarkdown: (node) => {
    if (
      node.attrs &&
      "selectedItems" in node.attrs &&
      node.attrs.selectedItems &&
      node.attrs.selectedItems.length > 0
    ) {
      const [item] = node.attrs.selectedItems as KnowledgeItem[];

      // Compute hasChildren with special logic for Notion if we have full node data.
      const hasChildren = isFullKnowledgeItem(item)
        ? computeHasChildren(item.node)
        : item.hasChildren;

      // Serialize essential data for model understanding and API fetching.
      // Format kept aligned with renderNode() output for consistency.
      return `<knowledge id="${item.nodeId}" title="${item.label}" space="${item.spaceId}" dsv="${item.dataSourceViewId}" hasChildren="${hasChildren}" />`;
    }

    // Don't serialize search state, empty nodes shouldn't be saved.
    return "";
  },

  parseMarkdown: (token) => {
    const selectedItem: BaseKnowledgeItem = {
      dataSourceViewId: token.dataSourceViewId,
      hasChildren: token.hasChildren,
      label: token.knowledgeTitle,
      nodeId: token.knowledgeId,
      spaceId: token.spaceId,
    };

    return {
      type: "knowledgeNode",
      attrs: {
        selectedItems: [selectedItem],
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(KnowledgeNodeView);
  },

  addCommands() {
    return {
      insertKnowledgeNode:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              selectedItems: [],
            },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Allow normal editing behavior.
    };
  },
});
