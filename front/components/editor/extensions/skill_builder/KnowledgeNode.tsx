import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { KnowledgeNodeView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";

// Minimal data from serialization
export interface BaseKnowledgeItem {
  dataSourceViewId: string;
  id: string;
  label: string;
  nodeType: string;
  spaceId: string;
}

// Fresh selection from search with complete node data
export interface FullKnowledgeItem extends BaseKnowledgeItem {
  node: DataSourceViewContentNode;
}

export type KnowledgeItem = BaseKnowledgeItem | FullKnowledgeItem;

export function isFullKnowledgeItem(
  item: KnowledgeItem
): item is FullKnowledgeItem {
  return item.node !== undefined;
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

export const KnowledgeNode = Node.create<{}>({
  name: "knowledgeNode",

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
      const idMatch = attributesString.match(/id="([^"]+)"/);
      const titleMatch = attributesString.match(/title="([^"]+)"/);
      const spaceMatch = attributesString.match(/space="([^"]*)"/);
      const dsvMatch = attributesString.match(/dsv="([^"]*)"/);
      const typeMatch = attributesString.match(/type="([^"]*)"/);

      if (!idMatch || !titleMatch) {
        return undefined;
      }

      const token = {
        type: "knowledgeNode",
        raw: match[0],
        knowledgeId: idMatch[1],
        knowledgeTitle: titleMatch[1],
        spaceId: spaceMatch ? spaceMatch[1] : undefined,
        dataSourceViewId: dsvMatch ? dsvMatch[1] : undefined,
        nodeType: typeMatch ? typeMatch[1] : undefined,
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
            "data-knowledge-description": selectedItems[0].description || "",
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

  renderMarkdown: (node: any) => {
    const { selectedItems } = node.attrs;
    if (selectedItems && selectedItems.length > 0) {
      const item = selectedItems[0];
      // Serialize essential data for model understanding and API fetching
      let apiParams = "";
      if (item.node?.dataSourceView) {
        const dsv = item.node.dataSourceView;
        const spaceId = dsv.spaceId || "";
        const dsvId = dsv.sId || "";
        const nodeType = item.node.type || "";
        apiParams = ` space="${spaceId}" dsv="${dsvId}" type="${nodeType}"`;
      }
      return `<knowledge id="${item.id}" title="${item.label}"${apiParams} />`;
    }
    // Don't serialize search state - empty nodes shouldn't be saved
    return "";
  },

  parseMarkdown: (token) => {
    console.log("Parsing markdown token for KnowledgeNode:", token);

    // The custom tokenizer provides knowledgeId and knowledgeTitle directly
    if (
      token.knowledgeId &&
      token.knowledgeTitle &&
      token.spaceId &&
      token.dataSourceViewId &&
      token.nodeType
    ) {
      const selectedItem: BaseKnowledgeItem = {
        id: token.knowledgeId,
        label: token.knowledgeTitle,
        spaceId: token.spaceId,
        dataSourceViewId: token.dataSourceViewId,
        nodeType: token.nodeType,
      };

      return {
        type: "knowledgeNode",
        attrs: {
          selectedItems: [selectedItem],
        },
      };
    }

    return undefined;
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
